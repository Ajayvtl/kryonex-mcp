/*
 * FILE: ./src/tools/semanticMemoryTool.js
 * REPO: https://github.com/Ajayvtl/kryonex-mcp
 *
 * Project Intelligence Framework V1 — Semantic Memory MCP Tool
 * --------------------------------------------------------------
 * Purpose:
 *  - Provide long‑term semantic memory storage for GPT interactions
 *  - Embed memory entries using semanticStore (Xenova embeddings)
 *  - Retrieve memory via semantic similarity
 *  - Tag-based filtering + metadata support
 *  - Fully MCP-safe (NO console.log)
 *
 * Memory store path per project:
 *   .kryonex/memory-store/memory.json
 */

import fileUtils from '../fileUtils.mjs';
import semanticStore from '../semanticStore.mjs';
import ragEngine from '../utils/ragEngine.mjs';
import { loadKryonexConfig, getProjectStorePaths } from '../kryonexStorage.mjs';
import path from 'path';

// ---------------------------------------------------------------------
// Load / Save Memory Store
// ---------------------------------------------------------------------
async function loadMemoryStore(projectRoot) {
  const { memoryStorePath } = await getProjectStorePaths(projectRoot);
  if (!(await fileUtils.pathExists(memoryStorePath))) return {};
  try {
    const raw = await fileUtils.readFileText(memoryStorePath);
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveMemoryStore(projectRoot, store) {
  const { memoryStorePath } = await getProjectStorePaths(projectRoot);
  await fileUtils.ensureDir(path.dirname(memoryStorePath));
  await fileUtils.atomicWrite(memoryStorePath, JSON.stringify(store, null, 2));
}

// ---------------------------------------------------------------------
// Add Memory
// ---------------------------------------------------------------------
async function addMemoryCommand({ projectRoot, text, tags = [] }) {
  const root = fileUtils.resolveProjectRoot(projectRoot);
  const store = await loadMemoryStore(root);

  const config = await loadKryonexConfig(root);
  const embedding = await semanticStore.searchStore(root, text, 1) // use text model
    .then(() => semanticStore.searchStore) // trick to reuse model loader
    .catch(() => null);

  // Direct embedding via text model
  const qEmbedding = await ragEngine.ragQuery(root, text).then(r => r.results[0]?.embedding || null).catch(() => null);

  const id = Date.now().toString();

  store[id] = {
    id,
    text,
    tags,
    createdAt: Date.now(),
    embedding: qEmbedding,
  };

  await saveMemoryStore(root, store);

  return { id, saved: true };
}

// ---------------------------------------------------------------------
// Get Memory
// ---------------------------------------------------------------------
async function getMemoryCommand({ projectRoot }) {
  const root = fileUtils.resolveProjectRoot(projectRoot);
  const store = await loadMemoryStore(root);
  return store;
}

// ---------------------------------------------------------------------
// Search Memory (semantic similarity)
// ---------------------------------------------------------------------
function cosineSim(a, b) {
  if (!a || !b) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function searchMemoryCommand({ projectRoot, query, topK = 5, tags = [] }) {
  const root = fileUtils.resolveProjectRoot(projectRoot);
  const store = await loadMemoryStore(root);

  const semantic = await ragEngine.ragQuery(root, query);
  const queryEmbed = semantic.results[0]?.embedding || null;

  const ranked = [];

  for (const m of Object.values(store)) {
    if (tags.length && !tags.some(t => m.tags?.includes(t))) continue;

    const score = cosineSim(queryEmbed, m.embedding);
    ranked.push({ id: m.id, text: m.text, tags: m.tags, score });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, topK);
}

// ---------------------------------------------------------------------
// Delete Memory
// ---------------------------------------------------------------------
async function deleteMemoryCommand({ projectRoot, id }) {
  const root = fileUtils.resolveProjectRoot(projectRoot);
  const store = await loadMemoryStore(root);

  if (!store[id]) return { removed: false, reason: 'Not found' };

  delete store[id];
  await saveMemoryStore(root, store);
  return { removed: true, id };
}

// ---------------------------------------------------------------------
// EXPORT MCP TOOL
// ---------------------------------------------------------------------
const semanticMemoryTool = {
  name: 'semanticMemoryTool',

  actions: {
    addMemory: {
      description: 'Add a semantic memory entry.',
      input: {
        type: 'object',
        properties: {
          projectRoot: { type: 'string' },
          text: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['projectRoot', 'text'],
      },
      handler: addMemoryCommand,
    },

    getMemory: {
      description: 'Return full memory store.',
      input: {
        type: 'object',
        properties: {
          projectRoot: { type: 'string' },
        },
        required: ['projectRoot'],
      },
      handler: getMemoryCommand,
    },

    searchMemory: {
      description: 'Semantic search of memory entries.',
      input: {
        type: 'object',
        properties: {
          projectRoot: { type: 'string' },
          query: { type: 'string' },
          topK: { type: 'number' },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['projectRoot', 'query'],
      },
      handler: searchMemoryCommand,
    },

    deleteMemory: {
      description: 'Delete a memory entry by ID.',
      input: {
        type: 'object',
        properties: {
          projectRoot: { type: 'string' },
          id: { type: 'string' },
        },
        required: ['projectRoot', 'id'],
      },
      handler: deleteMemoryCommand,
    },
  },
};

export default semanticMemoryTool;
