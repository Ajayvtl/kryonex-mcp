/**
 * FILE: ./src/models/kryonexStorage.js
 * Storage + config manager for Kryonex MCP Server
 */

import Database from "better-sqlite3";
import fs from "fs/promises";
import fssync from "fs";          // for existsSync only
import path from "path";
import fileUtils from "../utils/fileUtils.js";
import { loadTextEmbeddingModel, loadCodeEmbeddingModel } from "../../core/transformerLoader.mjs";
// ------------------------------------------------------
// DEFAULT CONFIG
// ------------------------------------------------------
const DEFAULT_CONFIG = {
  chunkSize: 1000,
  skipFolders: ["node_modules", ".git", ".kryonex", "build"],
  skipExtensions: [".lock"],
  maxFileSize: 5 * 1024 * 1024,
  embeddingModelText: "Xenova/all-MiniLM-L6-v2",
  embeddingModelCode: "Xenova/codebert-base",
  useLocalXenova: true,
  ragTopK: 8,
};
const text = await loadTextEmbeddingModel();
const code = await loadCodeEmbeddingModel();
// ------------------------------------------------------
// SQLITE INITIALIZER (safe on all OS + MCP Inspector)
// ------------------------------------------------------
export function initStorage(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fssync.existsSync(dir)) fssync.mkdirSync(dir, { recursive: true });

const db = new Database(dbPath, {
  fileMustExist: false,
  verbose: null,
  nativeBinding: undefined,   // Windows fix (prevents fsync call)
});

  // ⚠ Fix fsync failure on Windows + MCP Inspector
  db.pragma("journal_mode = MEMORY");
  db.pragma("synchronous = OFF");

  db.exec(`
    CREATE TABLE IF NOT EXISTS embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      embedding TEXT NOT NULL,
      metadata TEXT
    )
  `);

  return db;
}

// ------------------------------------------------------
// PATHS
// ------------------------------------------------------
export async function getProjectStorePaths(projectRoot) {
  const root = fileUtils.resolveProjectRoot(projectRoot);
  const kxRoot = path.join(root, ".kryonex");

  const paths = {
    kryonexRoot: kxRoot,
    configPath: path.join(kxRoot, "config.json"),
    vectorStorePath: path.join(kxRoot, "vector-store", "vectors.json"),
    memoryStorePath: path.join(kxRoot, "memory-store", "memory.json"),
    logsPath: path.join(kxRoot, "logs"),
    cachePath: path.join(kxRoot, "cache"),
  };

  await fileUtils.ensureDir(kxRoot);
  await fileUtils.ensureDir(path.join(kxRoot, "vector-store"));
  await fileUtils.ensureDir(path.join(kxRoot, "memory-store"));
  await fileUtils.ensureDir(paths.logsPath);
  await fileUtils.ensureDir(paths.cachePath);

  return paths;
}

// ------------------------------------------------------
// CONFIG LOAD
// ------------------------------------------------------
export async function loadKryonexConfig(projectRoot) {
  const { configPath } = await getProjectStorePaths(projectRoot);

  if (!(await fileUtils.pathExists(configPath))) {
    await fileUtils.atomicWrite(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }

  try {
    const raw = await fileUtils.readFileText(configPath);
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// ------------------------------------------------------
// CONFIG SAVE
// ------------------------------------------------------
export async function saveKryonexConfig(projectRoot, cfg) {
  const { configPath } = await getProjectStorePaths(projectRoot);
  const merged = { ...DEFAULT_CONFIG, ...cfg };
  await fileUtils.atomicWrite(configPath, JSON.stringify(merged, null, 2));
  return merged;
}

// ------------------------------------------------------
// CLEAR STORAGE
// ------------------------------------------------------
export async function clearKryonexData(projectRoot) {
  const paths = await getProjectStorePaths(projectRoot);

  await fileUtils.removePath(paths.vectorStorePath);
  await fileUtils.removePath(paths.memoryStorePath);
  await fileUtils.removePath(paths.cachePath);
  await fileUtils.ensureDir(paths.cachePath);

  return { cleared: true };
}

// ------------------------------------------------------
// LEGACY SAVE() — used by ollamaChat
// ------------------------------------------------------
export async function save(context, name, data, folder = "sessions") {
  const projectRoot = context?.projectRoot || process.cwd();
  const baseDir = path.join(projectRoot, ".kryonex", folder);

  await fs.mkdir(baseDir, { recursive: true });

  const filePath = path.join(baseDir, `${name}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));

  return filePath;
}

// ------------------------------------------------------
// EXPORT WRAPPER
// ------------------------------------------------------
export default {
  DEFAULT_CONFIG,
  initStorage,
  getProjectStorePaths,
  loadKryonexConfig,
  saveKryonexConfig,
  clearKryonexData,
  save,
};
