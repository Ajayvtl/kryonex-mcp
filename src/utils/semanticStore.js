/*
 * src/semanticStore.js
 * Project Intelligence Framework V1 — Hybrid Semantic Store (Text + Code Embeddings)
 *
 * Replace / add this file at: ./src/semanticStore.js
 *
 * Responsibilities:
 * - Chunk text files according to config.chunkSize
 * - Generate hybrid embeddings using Xenova (text + code models)
 * - Maintain per-project vector store in .kryonex/vector-store/*.json
 * - Deduplicate unchanged chunks via hash comparison
 * - Provide search API for RAG
 * - Provide API for updating / removing entries
 *
 * Requirements:
 * - Models resolved dynamically from config: config.embeddingModelText, config.embeddingModelCode
 * - Hybrid embedding: choose model based on file extension (code vs text)
 * - Uses kryonexStorage for config + storage paths
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import fileUtils from '../utils/fileUtils.js';
import { loadKryonexGeneralConfig, getProjectStorePaths } from '../models/kryonexStorage.js';
import { pipeline } from 'stream/promises';

// --- Embedding loader (Xenova) ---------------------------------------------
async function loadEmbeddingModel(modelName, useLocal) {
  // Set cache path for local models
  if (useLocal) {
    process.env.TRANSFORMERS_CACHE = path.join(os.homedir(), '.cache', 'transformers');
  }

  const { pipeline: hfPipeline } = await import('@xenova/transformers');
  const options = { quantized: true };
  if (useLocal) {
    options.local_files_only = true;
  }
  return await hfPipeline('feature-extraction', modelName, options);
}

// caches
const modelCache = new Map();
async function getModel(modelName, useLocal) {
  const cacheKey = `${modelName}-${useLocal}`;
  if (!modelCache.has(cacheKey)) {
    modelCache.set(cacheKey, await loadEmbeddingModel(modelName, useLocal));
  }
  return modelCache.get(cacheKey);
}

// --- Chunking --------------------------------------------------------------
function chunkText(text, chunkSize) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize;
  }
  return chunks;
}

// --- Hashing ---------------------------------------------------------------
function hashChunk(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}
// --- Determine model -------------------------------------------------------
function isCodeFile(ext) {
  return [
    '.js', '.js', '.cjs', '.ts', '.tsx', '.jsx',
    '.py', '.java', '.cpp', '.h', '.hpp',
    '.cs', '.go', '.rs', '.php', '.rb',
    '.swift', '.kt', '.kts', '.scala', '.sh', '.lua'
  ].includes(ext);
}

// --- Vector Store Load/Save ------------------------------------------------
async function loadVectorStore(projectRoot) {
  const { vectorStorePath } = await getProjectStorePaths(projectRoot);
  if (!(await fileUtils.pathExists(vectorStorePath))) return {};
  try {
    return JSON.parse(await fileUtils.readFileText(vectorStorePath));
  } catch {
    return {};
  }
}

async function saveVectorStore(projectRoot, store) {
  const { vectorStorePath } = await getProjectStorePaths(projectRoot);
  await fileUtils.ensureDir(path.dirname(vectorStorePath));
  await fileUtils.atomicWrite(vectorStorePath, JSON.stringify(store, null, 2));
}

// --- Embedding generator ---------------------------------------------------
async function embedContent(modelName, text, useLocal) {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return []; // Return an empty array for invalid input
  }
  const mdl = await getModel(modelName, useLocal);
  const out = await mdl(text);
  // Flatten to 1D array
  const arr = Array.from(out.data);
  return arr;
}

// --- Main ingestion --------------------------------------------------------
export async function ingestScannedFiles(projectRoot, scannedFiles) {
  const config = await loadKryonexGeneralConfig(projectRoot);
  const chunkSize = config.chunkSize || 1000;
  const store = await loadVectorStore(projectRoot);

  for (const { meta, content } of scannedFiles) {
    if (meta.isBinary) continue;
    const ext = path.extname(meta.relativePath).toLowerCase();

    const rawText = typeof content === 'string' ? content : content.toString('utf8');
    const chunks = chunkText(rawText, chunkSize);

    const codeModel = config.embeddingModelCode;
    const textModel = config.embeddingModelText;
    const usingModel = isCodeFile(ext) ? codeModel : textModel;

    const fileKey = meta.relativePath;
    store[fileKey] = store[fileKey] || {}; // per-file entry

    const newChunks = {};

    for (let idx = 0; idx < chunks.length; idx++) {
      const ch = chunks[idx];
      const hash = hashChunk(ch);

      // skip unchanged
      if (store[fileKey][idx] && store[fileKey][idx].hash === hash) {
        newChunks[idx] = store[fileKey][idx];
        continue;
      }

      const embedding = await embedContent(usingModel, ch, config.useLocalXenova);

      newChunks[idx] = {
        hash,
        embedding,
        text: ch,
        meta: {
          chunkIndex: idx,
          absolutePath: meta.absolutePath,
          relativePath: meta.relativePath,
          isCode: isCodeFile(ext),
        },
      };
    }

    store[fileKey] = newChunks;
  }

  await saveVectorStore(projectRoot, store);
  return store;
}

// --- Remove file entries ---------------------------------------------------
export async function removeFileFromStore(projectRoot, relativePath) {
  const store = await loadVectorStore(projectRoot);
  if (store[relativePath]) {
    delete store[relativePath];
    await saveVectorStore(projectRoot, store);
  }
}

// --- Search (Cosine similarity) -------------------------------------------
function cosineSim(a, b) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function searchStore(projectRoot, query, topK = 5) {
  const config = await loadKryonexGeneralConfig(projectRoot);
  const store = await loadVectorStore(projectRoot);

  // embed query with text model
  const qEmbedding = await embedContent(config.embeddingModelText, query, config.useLocalXenova);

  const results = [];

  for (const [file, chunks] of Object.entries(store)) {
    for (const [idx, ch] of Object.entries(chunks)) {
      const score = cosineSim(qEmbedding, ch.embedding);
      results.push({ file, chunkIndex: Number(idx), score, text: ch.text });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

// --- Exports ---------------------------------------------------------------
const semanticStore = {
  ingestScannedFiles,
  removeFileFromStore,
  searchStore,
};

export default semanticStore;
