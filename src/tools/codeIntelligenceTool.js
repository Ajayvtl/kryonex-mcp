/*
 * FILE: ./src/tools/codeIntelligenceTool.js
 * REPO: https://github.com/Ajayvtl/kryonex-mcp
 *
 * Project Intelligence Framework V1 — Code Intelligence MCP Tool (Enhanced)
 * --------------------------------------------------------------------------
 * This replaces/extends the older codeIntelligenceTool.js you attached.
 *
 * Responsibilities:
 *  - Provide advanced code analysis utilities
 *  - Integrate semantic RAG, language detection, framework detection
 *  - Summaries, dependency detection, symbol extraction (lightweight)
 *  - File-level + multi-file code intelligence
 *  - MCP-safe (NO console.log)
 */

import ragEngine from '../utils/ragEngine.mjs';
import projectScanner from '../projectScanner.mjs';
import languageDetection from '../languageDetection.mjs';
import fileUtils from '../fileUtils.mjs';
import path from 'path';

// ---------------------------------------------------------------------------
// Helper: Basic symbol extraction (lightweight regex-based)
// ---------------------------------------------------------------------------
function extractSymbols(content, lang) {
  if (!content) return [];
  const symbols = [];

  if (lang === 'javascript' || lang === 'typescript') {
    const fn = content.match(/function\s+(\w+)/g) || [];
    const cls = content.match(/class\s+(\w+)/g) || [];
    const exp = content.match(/export\s+(?:class|function|const|let|var)\s+(\w+)/g) || [];
    symbols.push(...fn, ...cls, ...exp);
  }

  if (lang === 'python') {
    const fn = content.match(/def\s+(\w+)/g) || [];
    const cls = content.match(/class\s+(\w+)/g) || [];
    symbols.push(...fn, ...cls);
  }

  return symbols.map((s) => s.replace(/(function|class|export)\s+/, ''));
}

// ---------------------------------------------------------------------------
// ANALYZE CODE FILE
// ---------------------------------------------------------------------------
async function analyzeCodeFileCommand({ projectRoot, relativePath }) {
  const root = fileUtils.resolveProjectRoot(projectRoot);
  const full = path.join(root, relativePath);

  if (!(await fileUtils.pathExists(full))) {
    return { exists: false, error: 'File not found.' };
  }

  const raw = await fileUtils.readFileAuto(full);
  const text = typeof raw === 'string' ? raw : '';
  const lang = languageDetection.detectLanguage(text, full);
  const symbols = extractSymbols(text, lang);

  const rag = await ragEngine.ragQuery(root, `Explain the following ${lang} file: ${relativePath}`);

  return {
    exists: true,
    file: relativePath,
    language: lang,
    symbols,
    context: rag.context,
    length: text.length,
  };
}

// ---------------------------------------------------------------------------
// MULTI-FILE INTELLIGENCE (dependency + similarity)
// ---------------------------------------------------------------------------
async function analyzeCodebaseCommand({ projectRoot, query }) {
  const root = fileUtils.resolveProjectRoot(projectRoot);
  const scan = await projectScanner.scanProject(root);

  const rag = await ragEngine.ragDeepContext(root, query, scan);

  const fileSummaries = scan.slice(0, 20).map(({ meta }) => ({
    path: meta.relativePath,
    size: meta.size,
  }));

  return {
    query,
    detectedFrameworks: rag.frameworks,
    context: rag.context,
    sampleFiles: fileSummaries,
  };
}

// ---------------------------------------------------------------------------
// CODE EXPLANATION (raw content + RAG enhanced)
// ---------------------------------------------------------------------------
async function explainCodeCommand({ projectRoot, code }) {
  const root = fileUtils.resolveProjectRoot(projectRoot);
  const lang = languageDetection.detectLanguage(code, 'inline');

  const rag = await ragEngine.ragQuery(root, `Explain this ${lang} code.`);

  return {
    language: lang,
    context: rag.context,
  };
}

// ---------------------------------------------------------------------------
// EXPORT MCP TOOL
// ---------------------------------------------------------------------------
const codeIntelligenceTool = {
  name: 'codeIntelligenceTool',

  actions: {
    analyzeCodeFile: {
      description: 'Analyze a single code file for symbols, RAG context, language.',
      input: {
        type: 'object',
        properties: {
          projectRoot: { type: 'string' },
          relativePath: { type: 'string' },
        },
        required: ['projectRoot', 'relativePath'],
      },
      handler: analyzeCodeFileCommand,
    },

    analyzeCodebase: {
      description: 'High-level codebase analysis (frameworks, similarity, structure).',
      input: {
        type: 'object',
        properties: {
          projectRoot: { type: 'string' },
          query: { type: 'string' },
        },
        required: ['projectRoot', 'query'],
      },
      handler: analyzeCodebaseCommand,
    },

    explainCode: {
      description: 'Explain inline code with semantic enhancement.',
      input: {
        type: 'object',
        properties: {
          projectRoot: { type: 'string' },
          code: { type: 'string' },
        },
        required: ['projectRoot', 'code'],
      },
      handler: explainCodeCommand,
    },
  },
};

export default codeIntelligenceTool;
