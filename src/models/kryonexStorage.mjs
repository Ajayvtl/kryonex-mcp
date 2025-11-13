/*
 * FILE: ./src/kryonexStorage.mjs
 * REPO: https://github.com/Ajayvtl/kryonex-mcp
 *
 * Project Intelligence Framework V1 — kryonexStorage (Upgraded)
 * ------------------------------------------------------------------
 * Centralized storage manager responsible for:
 *  - Loading & saving .kryonex/config.json
 *  - Providing per-project paths (vector store, memory store, logs, cache)
 *  - Ensuring directory structure exists
 *  - Managing multi-project support
 *
 * Fully MCP-safe (NO console.log)
 */

import path from 'path';
import fileUtils from './fileUtils.mjs';

// --------------------------------------------------------------
// DEFAULT CONFIG
// --------------------------------------------------------------
const DEFAULT_CONFIG = {
  chunkSize: 1000,
  skipFolders: ['node_modules', '.git', '.kryonex'],
  skipExtensions: ['.lock'],
  maxFileSize: 5 * 1024 * 1024,
  embeddingModelText: 'Xenova/all-MiniLM-L6-v2',
  embeddingModelCode: 'Xenova/codebert-base',
  ragTopK: 8,
};

// --------------------------------------------------------------
// PATH RESOLUTION
// --------------------------------------------------------------
export async function getProjectStorePaths(projectRoot) {
  const root = fileUtils.resolveProjectRoot(projectRoot);
  const kxRoot = path.join(root, '.kryonex');

  const paths = {
    kryonexRoot: kxRoot,
    configPath: path.join(kxRoot, 'config.json'),
    vectorStorePath: path.join(kxRoot, 'vector-store', 'vectors.json'),
    memoryStorePath: path.join(kxRoot, 'memory-store', 'memory.json'),
    logsPath: path.join(kxRoot, 'logs'),
    cachePath: path.join(kxRoot, 'cache'),
  };

  // Ensure directories exist
  await fileUtils.ensureDir(kxRoot);
  await fileUtils.ensureDir(path.join(kxRoot, 'vector-store'));
  await fileUtils.ensureDir(path.join(kxRoot, 'memory-store'));
  await fileUtils.ensureDir(paths.logsPath);
  await fileUtils.ensureDir(paths.cachePath);

  return paths;
}

// --------------------------------------------------------------
// LOAD CONFIG
// --------------------------------------------------------------
export async function loadKryonexConfig(projectRoot) {
  const { configPath } = await getProjectStorePaths(projectRoot);

  if (!(await fileUtils.pathExists(configPath))) {
    await fileUtils.atomicWrite(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }

  try {
    const raw = await fileUtils.readFileText(configPath);
    const userCfg = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...userCfg };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// --------------------------------------------------------------
// SAVE CONFIG
// --------------------------------------------------------------
export async function saveKryonexConfig(projectRoot, cfg) {
  const { configPath } = await getProjectStorePaths(projectRoot);
  const merged = { ...DEFAULT_CONFIG, ...cfg };
  await fileUtils.atomicWrite(configPath, JSON.stringify(merged, null, 2));
  return merged;
}

// --------------------------------------------------------------
// CLEAR STORAGE (vector, memory, cache)
// --------------------------------------------------------------
export async function clearKryonexData(projectRoot) {
  const paths = await getProjectStorePaths(projectRoot);
  await fileUtils.removePath(paths.vectorStorePath);
  await fileUtils.removePath(paths.memoryStorePath);
  await fileUtils.removePath(paths.cachePath);
  await fileUtils.ensureDir(paths.cachePath);

  return { cleared: true };
}

// --------------------------------------------------------------
// EXPORTS
// --------------------------------------------------------------
const kryonexStorage = {
  DEFAULT_CONFIG,
  getProjectStorePaths,
  loadKryonexConfig,
  saveKryonexConfig,
  clearKryonexData,
};

export default kryonexStorage;
