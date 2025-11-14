/*
 * src/projectScanner.js
 * Project Intelligence Framework V1 — Advanced project scanner
 *
 * Replace / add this file at: ./src/projectScanner.js
 *
 * Responsibilities:
 * - Walk project directory using fileUtils.walkDir
 * - Apply skipFolders / skipExtensions / maxFileSize from config
 * - Detect binary/text (via fileUtils)
 * - Generate metadata for each file
 * - Chunk text files (handled later by semanticStore; here we only produce raw content)
 * - Handle multi-project separation via projectRoot
 * - Produce consistent file records for semantic ingestion
 * - Required by: semanticStore, projectAnalyzerTool, projectManagerTool
 */

import path from 'path';
import fileUtils from '../utils/fileUtils.js';
import { loadKryonexConfig } from '../models/kryonexStorage.js';

// Meta helper ---------------------------------------------------------------
function buildFileMetadata(absPath, relPath, stat, isBinary) {
  return {
    absolutePath: absPath,
    relativePath: relPath,
    size: stat.size,
    mtime: stat.mtimeMs,
    isBinary,
  };
}

// Core scanner --------------------------------------------------------------
export async function scanProject(projectRoot) {
  const config = await loadKryonexConfig(projectRoot);
  const skipFolders = config.skipFolders || [];
  const skipExtensions = config.skipExtensions || [];
  const maxFileSize = config.maxFileSize || 5 * 1024 * 1024; // 5MB default

  const results = [];

  for await (const ent of fileUtils.walkDir(projectRoot, {
    ignore: skipFolders,
    followSymlinks: false,
  })) {
    if (ent.type !== 'file') continue;

    const abs = ent.path;
    const rel = path.relative(projectRoot, abs).replace(/\\/g, '/');
    const ext = path.extname(rel).toLowerCase();

    if (skipExtensions.includes(ext)) continue;

    let stat;
    try {
      stat = await fileUtils.statCache.stat(abs);
    } catch {
      continue;
    }

    if (stat.size > maxFileSize) continue;

    const content = await fileUtils.readFileAuto(abs);
    const isBinary = Buffer.isBuffer(content);

    const meta = buildFileMetadata(abs, rel, stat, isBinary);
    results.push({ meta, content });
  }

  return results;
}

// Exports ------------------------------------------------------------------
const projectScanner = {
  scanProject,
};

export default projectScanner;
