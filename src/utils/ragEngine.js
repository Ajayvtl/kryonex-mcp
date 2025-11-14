/*
 * src/utils/ragEngine.js
 * Project Intelligence Framework V1 — RAG Engine
 *
 * PLACE THIS FILE AT: ./src/utils/ragEngine.js
 * (Note: You requested all new modules under the utils folder.)
 *
 * Responsibilities:
 * - High‑level retrieval engine combining semanticStore + scanners + detectors
 * - Hybrid RAG that understands code, frameworks, and language context
 * - Builds ranked context blocks for analyzers, code tools, and memory tools
 * - Lightweight + MCP-safe
 */

import semanticStore from '../utils/semanticStore.js';
import languageDetection from '../utils/languageDetection.js';
import frameworkDetection from '../utils/frameworkDetection.js';
import projectScanner from '../utils/projectScanner.js';
import fileUtils from '../utils/fileUtils.js';
import { loadKryonexGeneralConfig } from '../models/kryonexStorage.js';

// ---------------------------------------------------------
// Build context blocks from search results
// ---------------------------------------------------------
function buildContext(results) {
  return results.map((r) => {
    return {
      file: r.file,
      chunkIndex: r.chunkIndex,
      score: r.score,
      text: r.text,
    };
  });
}

// ---------------------------------------------------------
// Main RAG Query Function
// ---------------------------------------------------------
export async function ragQuery(projectRoot, query, { topK = 8 } = {}) {
  // Search the vector store
  const results = await semanticStore.searchStore(projectRoot, query, topK);
  const context = buildContext(results);
  return { context, results };
}

// ---------------------------------------------------------
// Deep Context: Scanning + RAG + detectors
// ---------------------------------------------------------
export async function ragDeepContext(projectRoot, query, scannedFiles = null) {
  const config = await loadKryonexGeneralConfig(projectRoot);

  // If caller didn't provide scanned files, auto-scan
  let scanData = scannedFiles;
  if (!scanData) {
    scanData = await projectScanner.scanProject(projectRoot);
  }

  // Detect frameworks used in the project
  const frameworks = await frameworkDetection.detectFrameworks(projectRoot, scanData);

  // Perform semantic search
  const semantic = await ragQuery(projectRoot, query, { topK: config.ragTopK || 8 });

  return {
    frameworks,
    context: semantic.context,
    results: semantic.results,
  };
}

// ---------------------------------------------------------
// Utility: Get enriched RAG report
// ---------------------------------------------------------
export async function ragReport(projectRoot, query) {
  const deep = await ragDeepContext(projectRoot, query);

  return {
    query,
    frameworksDetected: deep.frameworks,
    topChunks: deep.context,
  };
}

// ---------------------------------------------------------
// Exports
// ---------------------------------------------------------
const ragEngine = {
  ragQuery,
  ragDeepContext,
  ragReport,
};

export default ragEngine;
