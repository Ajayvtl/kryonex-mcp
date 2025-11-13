/*
 * src/frameworkDetection.mjs
 * Project Intelligence Framework V1 — Framework & Library Detector
 *
 * Replace / add this file at: ./src/frameworkDetection.mjs
 *
 * Responsibilities:
 * - Detect frameworks used in a project based on:
 *    - package.json dependencies
 *    - keywords in files
 *    - folder structures (src/routes, pages/, app/, etc)
 * - Lightweight, dependency-free, MCP-safe
 * - Returns a consistent framework descriptor object
 * - Used by projectAnalyzerTool + RAG engine
 */

import path from 'path';
import fileUtils from './fileUtils.mjs';
import { loadKryonexConfig } from './kryonexStorage.mjs';

// --- Known frameworks patterns ---------------------------------------------
const FRAMEWORK_PATTERNS = {
  react: {
    deps: ['react', 'react-dom'],
    files: [/jsx?$/, /tsx?$/],
  },
  nextjs: {
    deps: ['next'],
    structure: ['pages', 'app'],
  },
  express: {
    deps: ['express'],
    keywords: [/app\.get\(/, /app\.use\(/, /express\(/],
  },
  node: {
    deps: ['nodemon'],
    files: [/\.js$/],
  },
  fastapi: {
    keywords: [/from\s+fastapi\s+import/, /FastAPI\(/],
  },
  flask: {
    keywords: [/from\s+flask\s+import/, /Flask\(/],
  },
  django: {
    deps: ['django'],
  },
  laravel: {
    structure: ['app', 'artisan'],
  },
  spring: {
    keywords: [/SpringApplication\.run/],
  },
  vue: {
    deps: ['vue'],
    files: [/\.vue$/],
  },
  svelte: {
    deps: ['svelte'],
    files: [/\.svelte$/],
  },
};

// --- Read package.json if exists -------------------------------------------
async function readDependencies(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!(await fileUtils.pathExists(pkgPath))) return {};
  try {
    const pkg = JSON.parse(await fileUtils.readFileText(pkgPath));
    return {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
  } catch {
    return {};
  }
}

// --- Detect by deps ---------------------------------------------------------
function checkDeps(framework, deps) {
  if (!framework.deps) return false;
  return framework.deps.some((d) => deps[d]);
}

// --- Detect by keywords -----------------------------------------------------
function checkKeywords(framework, content) {
  if (!framework.keywords) return false;
  return framework.keywords.some((re) => re.test(content));
}

// --- Detect by file extension ----------------------------------------------
function checkFiles(framework, relPath) {
  if (!framework.files) return false;
  return framework.files.some((re) => re.test(relPath));
}

// --- Detect by structure ----------------------------------------------------
async function checkStructure(framework, projectRoot) {
  if (!framework.structure) return false;
  for (const s of framework.structure) {
    const p = path.join(projectRoot, s);
    if (await fileUtils.pathExists(p)) return true;
  }
  return false;
}

// --- Main detection ---------------------------------------------------------
export async function detectFrameworks(projectRoot, scannedFiles) {
  const deps = await readDependencies(projectRoot);
  const detected = new Set();

  for (const [fwName, fw] of Object.entries(FRAMEWORK_PATTERNS)) {
    let hit = false;

    // check deps
    if (checkDeps(fw, deps)) hit = true;

    // check structure
    if (!hit && (await checkStructure(fw, projectRoot))) hit = true;

    // check files & keywords
    if (!hit) {
      for (const { meta, content } of scannedFiles) {
        const rel = meta.relativePath;
        const text = typeof content === 'string' ? content : '';

        if (checkFiles(fw, rel)) {
          hit = true;
          break;
        }

        if (text && checkKeywords(fw, text)) {
          hit = true;
          break;
        }
      }
    }

    if (hit) detected.add(fwName);
  }

  return Array.from(detected);
}

// --- Exports ---------------------------------------------------------------
const frameworkDetection = {
  detectFrameworks,
};

export default frameworkDetection;
