/*
 * src/fileUtils.mjs
 * Production-grade file utilities for Project Intelligence Framework V1
 * Replace / add this file at: ./src/fileUtils.mjs (or overwrite existing fileUtils.mjs at project root if you prefer)
 *
 * Features:
 * - safe atomic writes
 * - robust directory walking with ignore patterns
 * - JSONC + YAML read/write
 * - binary/text detection
 * - cached stat lookups with TTL
 * - safe copy, ensureDir, remove
 * - stream helpers
 *
 * Note: depends on built-in node modules and these packages already in package.json:
 * - jsonc-parser
 * - yaml
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { parse as parseJSONC } from 'jsonc-parser';
import YAML from 'yaml';
import { pipeline } from 'stream/promises';

const DEFAULT_STAT_TTL = 5_000; // ms
const BINARY_DETECT_BYTES = 800;

// --- Helper utilities ------------------------------------------------------
function toPosix(p) {
  return p.split(path.sep).join('/');
}

function makeTempPath(dir, prefix = 'tmp') {
  const name = `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  return path.join(dir, name);
}

function normalizeIgnorePatterns(patterns = []) {
  return patterns.map((p) => {
    // simple support:
    // - patterns ending with '/**' -> prefix match
    // - patterns starting with '!' -> negate
    // - simple wildcard '*' supported (convert to RegExp)
    const neg = p.startsWith('!');
    const pat = neg ? p.slice(1) : p;
    const escaped = pat.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\\\*/g, '.*');
    const re = new RegExp(`^${escaped}$`);
    return { raw: p, neg, re };
  });
}

function matchesAny(patterns, relativePath) {
  if (!patterns || patterns.length === 0) return false;
  // check in order; later patterns can override earlier ones
  let matched = false;
  for (const p of patterns) {
    if (p.re.test(relativePath)) {
      matched = !p.neg;
    }
  }
  return matched;
}

// --- stat cache -----------------------------------------------------------
class StatCache {
  constructor(ttl = DEFAULT_STAT_TTL) {
    this.ttl = ttl;
    this.cache = new Map();
  }

  async stat(filePath) {
    const now = Date.now();
    const entry = this.cache.get(filePath);
    if (entry && (now - entry.ts) < this.ttl) {
      return entry.stat;
    }
    try {
      const s = await fsp.stat(filePath);
      this.cache.set(filePath, { stat: s, ts: now });
      return s;
    } catch (err) {
      this.cache.delete(filePath);
      throw err;
    }
  }

  invalidate(filePath) {
    this.cache.delete(filePath);
  }
}

const statCache = new StatCache();

// --- core file utilities --------------------------------------------------
export async function ensureDir(dirPath, { mode = 0o755 } = {}) {
  await fsp.mkdir(dirPath, { recursive: true, mode });
}

export async function readFileText(filePath, { encoding = 'utf8' } = {}) {
  const buf = await fsp.readFile(filePath);
  return buf.toString(encoding);
}

export async function readFileAuto(filePath) {
  // read small chunk to detect binary
  const fd = await fsp.open(filePath, 'r');
  try {
    const { buffer } = await fd.read(Buffer.alloc(BINARY_DETECT_BYTES), 0, BINARY_DETECT_BYTES, 0);
    const isBin = isBufferBinary(buffer);
    if (isBin) {
      return await fsp.readFile(filePath); // return Buffer
    }
    // assume text
    return (await fsp.readFile(filePath)).toString('utf8');
  } finally {
    await fd.close();
  }
}

export function isBufferBinary(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (buf.length === 0) return false;
  const len = Math.min(buf.length, BINARY_DETECT_BYTES);
  for (let i = 0; i < len; i++) {
    const val = buf[i];
    if (val === 0) return true; // NUL byte
  }
  // heuristics: if many non-text bytes
  let nonPrintable = 0;
  for (let i = 0; i < len; i++) {
    const c = buf[i];
    if (c > 0x7f) nonPrintable++;
  }
  return (nonPrintable / len) > 0.3; // arbitrary threshold
}

export async function atomicWrite(filePath, data, { encoding = 'utf8', mode = 0o644, fsync = true } = {}) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tmp = makeTempPath(dir, '.atomic');
  const writeOptions = typeof data === 'string' ? { encoding } : undefined;
  await fsp.writeFile(tmp, data, writeOptions);
  await fsp.chmod(tmp, mode);
  if (fsync) {
    const fd = await fsp.open(tmp, 'r');
    try {
      await fd.sync();
    } finally {
      await fd.close();
    }
  }
  await fsp.rename(tmp, filePath);
  statCache.invalidate(filePath);
}

export async function readJSONCFile(filePath, { allowEmpty = false } = {}) {
  const txt = await readFileText(filePath);
  if (!txt && allowEmpty) return {};
  return parseJSONC(txt);
}

export async function writeJSONFile(filePath, obj, { space = 2 } = {}) {
  const txt = JSON.stringify(obj, null, space) + '\n';
  await atomicWrite(filePath, txt, { encoding: 'utf8' });
}

export async function readYamlFile(filePath) {
  const txt = await readFileText(filePath);
  return YAML.parse(txt);
}

export async function writeYamlFile(filePath, obj) {
  const txt = YAML.stringify(obj);
  await atomicWrite(filePath, txt, { encoding: 'utf8' });
}

export async function copyFileSafe(src, dest, { overwrite = true } = {}) {
  await ensureDir(path.dirname(dest));
  const flags = overwrite ? 0 : fs.constants.COPYFILE_EXCL;
  await fsp.copyFile(src, dest, flags);
  statCache.invalidate(dest);
}

export async function removePath(target) {
  // safe remove for file or directory
  try {
    const st = await fsp.lstat(target);
    if (st.isDirectory() && !st.isSymbolicLink()) {
      // recursive rm
      await fsp.rm(target, { recursive: true, force: true });
    } else {
      await fsp.unlink(target).catch(() => {});
    }
    statCache.invalidate(target);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return;
    throw err;
  }
}

// --- directory walker -----------------------------------------------------
/**
 * Async generator that yields file paths.
 * - root: starting path
 * - options:
 *    ignore: array of glob-like patterns (supports * and exact prefixes)
 *    followSymlinks: boolean
 *    maxDepth: number
 */
export async function* walkDir(root, options = {}) {
  const { ignore = [], followSymlinks = false, maxDepth = Infinity } = options;
  const patterns = normalizeIgnorePatterns(ignore.map((p) => toPosix(p)));

  async function* walk(curr, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await fsp.readdir(curr, { withFileTypes: true });
    } catch (err) {
      return; // permission denied etc
    }

    for (const ent of entries) {
      const full = path.join(curr, ent.name);
      const rel = toPosix(path.relative(root, full) || ent.name);

      if (matchesAny(patterns, rel)) continue;

      try {
        if (ent.isDirectory()) {
          yield { path: full, name: ent.name, type: 'directory' };
          yield* walk(full, depth + 1);
        } else if (ent.isSymbolicLink()) {
          if (followSymlinks) {
            const stat = await fsp.stat(full);
            if (stat.isDirectory()) {
              yield { path: full, name: ent.name, type: 'directory', symlink: true };
              yield* walk(full, depth + 1);
            } else {
              yield { path: full, name: ent.name, type: 'file', symlink: true };
            }
          } else {
            yield { path: full, name: ent.name, type: 'symlink' };
          }
        } else if (ent.isFile()) {
          yield { path: full, name: ent.name, type: 'file' };
        } else {
          yield { path: full, name: ent.name, type: 'other' };
        }
      } catch (err) {
        // ignore noisy errors per-file
        continue;
      }
    }
  }

  yield* walk(root, 0);
}

// --- stream helpers ------------------------------------------------------
export async function streamToFile(readable, destPath) {
  await ensureDir(path.dirname(destPath));
  const tmp = makeTempPath(path.dirname(destPath), '.stream');
  const ws = fs.createWriteStream(tmp);
  await pipeline(readable, ws);
  await fsp.rename(tmp, destPath);
  statCache.invalidate(destPath);
}

export async function fileToStream(srcPath) {
  return fs.createReadStream(srcPath);
}

// --- utility helpers -----------------------------------------------------
export function resolveProjectRoot(startPath = process.cwd(), { stopAt = undefined } = {}) {
  // heuristic: walk upwards until package.json or .git or .kryonex
  let cur = path.resolve(startPath);
  const rootStop = stopAt ? path.resolve(stopAt) : path.parse(cur).root;
  while (true) {
    try {
      const files = fs.readdirSync(cur);
      if (files.includes('package.json') || files.includes('.git') || files.includes('.kryonex')) return cur;
    } catch (err) {
      // ignore
    }
    if (cur === rootStop) break;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return startPath;
}

export async function pathExists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch (err) {
    return false;
  }
}

export async function readTextOrThrow(filePath, message) {
  try {
    return await readFileText(filePath);
  } catch (err) {
    throw new Error(`${message}: ${err.message}`);
  }
}

// --- exports --------------------------------------------------------------
const fileUtils = {
  ensureDir,
  readFileText,
  readFileAuto,
  isBufferBinary,
  atomicWrite,
  readJSONCFile,
  writeJSONFile,
  readYamlFile,
  writeYamlFile,
  copyFileSafe,
  removePath,
  walkDir,
  streamToFile,
  fileToStream,
  resolveProjectRoot,
  pathExists,
  readTextOrThrow,
  statCache,
};

export default fileUtils;
