/*
 * FILE: ./src/tools/projectManagerTool.js
 * REPO: https://github.com/Ajayvtl/kryonex-mcp
 *
 * Project Intelligence Framework V1 — Project Manager MCP Tool
 * ------------------------------------------------------------
 * Exposes top‑level MCP commands for:
 *  - scanning the project
 *  - ingesting scanned files into semantic store
 *  - removing files
 *  - refreshing vector store
 *  - retrieving project info
 *
 * This tool is used directly by index.ts (MCP Server).
 * All functions must be promise-based and MCP‑safe (NO console.log).
 */

import projectScanner from '../projectScanner.mjs';
import semanticStore from '../semanticStore.mjs';
import fileUtils from '../fileUtils.mjs';
import { loadKryonexConfig } from '../kryonexStorage.mjs';
import path from 'path';

// -------------------------------------------------------------
// Utility: Resolve project root
// -------------------------------------------------------------
async function resolveRoot(startPath) {
  return fileUtils.resolveProjectRoot(startPath);
}

// -------------------------------------------------------------
// Command: Scan Project
// -------------------------------------------------------------
async function scanProjectCommand({ projectRoot }) {
  const root = await resolveRoot(projectRoot);
  const scanned = await projectScanner.scanProject(root);
  return { root, scannedCount: scanned.length, scanned };
}

// -------------------------------------------------------------
// Command: Ingest
// -------------------------------------------------------------
async function ingestCommand({ projectRoot }) {
  const root = await resolveRoot(projectRoot);
  const scanned = await projectScanner.scanProject(root);
  const store = await semanticStore.ingestScannedFiles(root, scanned);
  return { root, chunkedFiles: Object.keys(store).length };
}

// -------------------------------------------------------------
// Command: Remove File From Store
// -------------------------------------------------------------
async function removeFileCommand({ projectRoot, relativePath }) {
  const root = await resolveRoot(projectRoot);
  await semanticStore.removeFileFromStore(root, relativePath);
  return { removed: relativePath };
}

// -------------------------------------------------------------
// Command: Get Project Info
// -------------------------------------------------------------
async function projectInfoCommand({ projectRoot }) {
  const root = await resolveRoot(projectRoot);
  const cfg = await loadKryonexConfig(root);

  return {
    projectRoot: root,
    config: cfg,
  };
}

// -------------------------------------------------------------
// Export MCP tool definition
// -------------------------------------------------------------
const projectManagerTool = {
  name: 'projectManagerTool',

  actions: {
    scanProject: {
      description: 'Scan the project and return raw file data + metadata.',
      input: {
        type: 'object',
        properties: {
          projectRoot: { type: 'string' },
        },
        required: ['projectRoot'],
      },
      handler: scanProjectCommand,
    },

    ingest: {
      description: 'Ingest the project files into the semantic vector store.',
      input: {
        type: 'object',
        properties: {
          projectRoot: { type: 'string' },
        },
        required: ['projectRoot'],
      },
      handler: ingestCommand,
    },

    removeFile: {
      description: 'Remove a file entry from the vector store.',
      input: {
        type: 'object',
        properties: {
          projectRoot: { type: 'string' },
          relativePath: { type: 'string' },
        },
        required: ['projectRoot', 'relativePath'],
      },
      handler: removeFileCommand,
    },

    projectInfo: {
      description: 'Return Kryonex project info + config.',
      input: {
        type: 'object',
        properties: {
          projectRoot: { type: 'string' },
        },
        required: ['projectRoot'],
      },
      handler: projectInfoCommand,
    },
  },
};

export default projectManagerTool;
