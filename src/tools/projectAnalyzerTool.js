/*
 * FILE: ./src/tools/projectAnalyzerTool.js
 * REPO: https://github.com/Ajayvtl/kryonex-mcp
 *
 * Project Intelligence Framework V1 — Project Analyzer MCP Tool
 * --------------------------------------------------------------
 * Provides project-level and file-level analysis using:
 *  - ragEngine (context retrieval)
 *  - languageDetection
 *  - frameworkDetection
 *  - projectScanner
 *  - semanticStore
 *
 * This tool is called by index.ts and exposes MCP actions for:
 *  - analyzeFile
 *  - analyzeQuery (semantic + framework-aware)
 *  - analyzeProjectStructure
 *
 * 100% MCP-safe: NO console.log.
 */

import ragEngine from '../utils/ragEngine.mjs';
import projectScanner from '../projectScanner.mjs';
import languageDetection from '../languageDetection.mjs';
import frameworkDetection from '../frameworkDetection.mjs';
import fileUtils from '../fileUtils.mjs';
import { loadKryonexConfig } from '../kryonexStorage.mjs';
import path from 'path';

// ---------------------------------------------------------------------------
// Utility: Resolve project root
// ---------------------------------------------------------------------------
async function resolveRoot(startPath) {
  return fileUtils.resolveProjectRoot(startPath);
}

// ---------------------------------------------------------------------------
// ANALYZE FILE
// ---------------------------------------------------------------------------
async function analyzeFileCommand({ projectRoot, relativePath }) {
  const root = await resolveRoot(projectRoot);
  const full = path.join(root, relativePath);

  const exists = await fileUtils.pathExists(full);
  if (!exists) {
    return {
      file: relativePath,
      exists: false,
      error: 'File does not exist in project.',
    };
  }

  const content = await fileUtils.readFileAuto(full);
  const text = typeof content === 'string' ? content : '[binary file omitted]';
  const lang = languageDetection.detectLanguage(text, full);

  const query = `Summarize and analyze the following ${lang} file.`;
  const rag = await ragEngine.ragQuery(root, query);

  return {
    file: relativePath,
    exists: true,
    language: lang,
    content: text,
    ragContext: rag.context,
  };
}

// ---------------------------------------------------------------------------
// ANALYZE QUERY (Semantic + Framework-aware)
// ---------------------------------------------------------------------------
async function analyzeQueryCommand({ projectRoot, query }) {
  const root = await resolveRoot(projectRoot);

  const scanned = await projectScanner.scanProject(root);
  const frameworks = await frameworkDetection.detectFrameworks(root, scanned);
  const rag = await ragEngine.ragDeepContext(root, query, scanned);

  return {
    query,
    frameworksDetected: frameworks,
    context: rag.context,
    results: rag.results,
  };
}

// ---------------------------------------------------------------------------
// ANALYZE PROJECT STRUCTURE
// ---------------------------------------------------------------------------
async function analyzeProjectStructureCommand({ projectRoot }) {
  const root = await resolveRoot(projectRoot);
  const scanned = await projectScanner.scanProject(root);

  const fileCount = scanned.length;
  const languages = new Set();

  for (const { meta, content } of scanned) {
    if (meta.isBinary) continue;
    const text = typeof content === 'string' ? content : '';
    languages.add(languageDetection.detectLanguage(text, meta.relativePath));
  }

  const frameworks = await frameworkDetection.detectFrameworks(root, scanned);

  return {
    projectRoot: root,
    totalFiles: fileCount,
    languages: Array.from(languages),
    frameworksDetected: frameworks,
    sampleFiles: scanned.slice(0, 10).map((f) => f.meta.relativePath),
  };
}

// ---------------------------------------------------------------------------
// EXPORT MCP TOOL
// ---------------------------------------------------------------------------
const projectAnalyzerTool = {
  name: 'projectAnalyzerTool',

  actions: {
    analyzeFile: {
      description: 'Analyze a specific file in the project.',
      input: {
        type: 'object',
        properties: {
          projectRoot: { type: 'string' },
          relativePath: { type: 'string' },
        },
        required: ['projectRoot', 'relativePath'],
      },
      handler: analyzeFileCommand,
    },

    analyzeQuery: {
      description: 'Semantic + framework-aware analysis query over the project.',
      input: {
        type: 'object',
        properties: {
          projectRoot: { type: 'string' },
          query: { type: 'string' },
        },
        required: ['projectRoot', 'query'],
      },
      handler: analyzeQueryCommand,
    },

    analyzeProjectStructure: {
      description: 'Analyze high-level structure, languages, frameworks.',
      input: {
        type: 'object',
        properties: {
          projectRoot: { type: 'string' },
        },
        required: ['projectRoot'],
      },
      handler: analyzeProjectStructureCommand,
    },
  },
};

export default projectAnalyzerTool;
