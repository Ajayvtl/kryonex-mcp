/*
 * src/languageDetection.js
 * Project Intelligence Framework V1 — Lightweight Language Detector
 *
 * Replace / add this file at: ./src/languageDetection.js
 *
 * Responsibilities:
 * - Identify language of a file based on extension + lightweight heuristic
 * - Provide consistent output for analyzers, RAG engine, and metadata
 * - No external dependencies (fast + MCP-safe)
 */

import path from 'path';

// --- Extension → Language mapping ------------------------------------------
const EXT_MAP = {
  '.js': 'javascript', '.js': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript', '.jsx': 'javascript',
  '.py': 'python', '.java': 'java', '.cpp': 'cpp', '.c': 'c', '.h': 'c', '.hpp': 'cpp',
  '.cs': 'csharp', '.go': 'go', '.rs': 'rust', '.php': 'php', '.rb': 'ruby',
  '.swift': 'swift', '.kt': 'kotlin', '.kts': 'kotlin', '.scala': 'scala',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell', '.lua': 'lua',
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
  '.md': 'markdown', '.txt': 'text'
};

// --- Heuristic detection for unknown extensions -----------------------------
function heuristicDetect(text) {
  if (!text) return 'unknown';

  // simple heuristics
  if (/^#!/.test(text)) {
    if (text.includes('python')) return 'python';
    if (text.includes('node')) return 'javascript';
    if (text.includes('bash')) return 'shell';
  }

  if (/class\s+\w+/.test(text) && /public\s+static/.test(text)) return 'java';
  if (/def\s+\w+/.test(text)) return 'python';
  if (/function\s+\w+/.test(text) || /=>/.test(text)) return 'javascript';
  if (/package\s+main/.test(text) || /func\s+\w+/.test(text)) return 'go';
  if (/#include\s+</.test(text)) return 'c/cpp';
  if (/fn\s+\w+/.test(text) && /let\s+/.test(text)) return 'rust';

  return 'text';
}

// --- Public API -------------------------------------------------------------
export function detectLanguageFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_MAP[ext] || 'unknown';
}

export function detectLanguage(content, filePath) {
  const fromExt = detectLanguageFromPath(filePath);
  if (fromExt !== 'unknown') return fromExt;
  return heuristicDetect(content);
}

// --- Export object ----------------------------------------------------------
const languageDetection = {
  detectLanguageFromPath,
  detectLanguage,
};

export default languageDetection;
