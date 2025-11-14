import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let Database = null;

try {
  // Use dynamic import for better ESM compatibility if better-sqlite3 is an ESM module itself
  // If it's CommonJS, require might still be needed, but let's try dynamic import first.
  const sqlite3Module = await import('better-sqlite3');
  Database = sqlite3Module.default;
} catch (e) {
  console.error("⚠ better-sqlite3 missing — Kryonex will fall back to JSON.", e.message);
  Database = null;
}

function ensureKryonexFolder(root) {
  const dir = path.join(root, ".kryonex");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function openDb(root) { // Make openDb async
  if (!Database) return null;

  const dir = ensureKryonexFolder(root);
  const file = path.join(dir, "kryonex.db");

  // Use a try-catch block for database instantiation
  let db;
  try {
    db = new Database(file);
    db.pragma("journal_mode = WAL");
  } catch (error) {
    console.error(`Error opening SQLite database ${file}:`, error);
    return null; // Return null if DB cannot be opened
  }


  db.exec(`
      CREATE TABLE IF NOT EXISTS files (
          id INTEGER PRIMARY KEY,
          path TEXT UNIQUE,
          hash TEXT,
          lang TEXT,
          last_modified INTEGER
      );
      CREATE TABLE IF NOT EXISTS symbols (
          id INTEGER PRIMARY KEY,
          file_id INTEGER,
          name TEXT,
          kind TEXT,
          FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS calls (
          id INTEGER PRIMARY KEY,
          file_id INTEGER,
          caller TEXT,
          callee TEXT,
          loc_line INTEGER,
          FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      );
  `);

  return {
    // --------------------------
    // 1. Basic metadata
    // --------------------------
    getAllFiles() {
      return db.prepare(`SELECT path FROM files`).all();
    },

    upsertFile(filePath, hash, lang, modifiedTime) {
      const existing = db.prepare(
        `SELECT id, hash FROM files WHERE path = ?`
      ).get(filePath);

      if (existing && existing.hash === hash) {
        return { fileId: existing.id, changed: false };
      }

      if (existing) {
        db.prepare(
          `UPDATE files SET hash=?, lang=?, last_modified=? WHERE id=?`
        ).run(hash, lang, modifiedTime, existing.id);

        return { fileId: existing.id, changed: true };
      }

      const res = db.prepare(
        `INSERT INTO files (path, hash, lang, last_modified) VALUES (?, ?, ?, ?)`
      ).run(filePath, hash, lang, modifiedTime);

      return { fileId: res.lastInsertRowid, changed: true };
    },

    cleanupMissingFiles(activeFiles) {
      const stmt = db.prepare(`SELECT path FROM files`);
      const all = stmt.all();

      const activeSet = new Set(activeFiles);
      const removed = [];

      const del = db.prepare(`DELETE FROM files WHERE path = ?`);

      for (const f of all) {
        if (!activeSet.has(f.path)) {
          del.run(f.path);
          removed.push(f.path);
        }
      }
      return removed.length;
    },

    // --------------------------
    // 2. Symbols
    // --------------------------
    clearSymbols(fileId) {
      db.prepare(`DELETE FROM symbols WHERE file_id=?`).run(fileId);
    },

    replaceSymbols(fileId, symbols) {
      const stmt = db.prepare(
        `INSERT INTO symbols (file_id, name, kind) VALUES (?, ?, ?)`
      );
      for (const s of symbols) stmt.run(fileId, s.name, s.kind);
    },

    // --------------------------
    // 3. Calls
    // --------------------------
    replaceCalls(fileId, calls) {
      db.prepare(`DELETE FROM calls WHERE file_id=?`).run(fileId);

      const stmt = db.prepare(
        `INSERT INTO calls (file_id, caller, callee, loc_line) VALUES (?, ?, ?, ?)`
      );
      for (const c of calls) stmt.run(fileId, c.caller_name, c.callee_name, c.loc_line);
    },

    generateCallgraph(root) {
      const rows = db.prepare(
        `SELECT caller, callee FROM calls WHERE caller IS NOT NULL AND callee IS NOT NULL`
      ).all();

      const callers = {};
      const callees = {};

      for (const r of rows) {
        callers[r.callee] ||= [];
        callers[r.callee].push(r.caller);

        callees[r.caller] ||= [];
        callees[r.caller].push(r.callee);
      }

      fs.writeFileSync(
        path.join(root, ".kryonex", "callgraph.json"),
        JSON.stringify({ callers, callees }, null, 2)
      );
    },

    // --------------------------
    // 4. Query APIs
    // --------------------------
    querySymbol(name) {
      return db.prepare(
        `SELECT f.path, s.name, s.kind
           FROM symbols s JOIN files f ON s.file_id = f.id
          WHERE s.name = ?`
      ).all(name);
    },

    queryReferences(symbol) {
      return db.prepare(
        `SELECT f.path, c.caller, c.loc_line
           FROM calls c JOIN files f ON c.file_id = f.id
          WHERE c.callee = ?`
      ).all(symbol);
    },

    queryCallers(symbol) {
      return db.prepare(
        `SELECT caller FROM calls WHERE callee = ?`
      ).all(symbol);
    },

    queryCallees(symbol) {
      return db.prepare(
        `SELECT callee FROM calls WHERE caller = ?`
      ).all(symbol);
    },

    // --------------------------
    // ✅ Full working SUMMARY
    // --------------------------
    summary() {
      const files = db.prepare(`SELECT COUNT(*) AS n FROM files`).get().n;
      const syms = db.prepare(`SELECT COUNT(*) AS n FROM symbols`).get().n;
      const calls = db.prepare(`SELECT COUNT(*) AS n FROM calls`).get().n;

      return {
        status: "ready",
        files,
        symbols: syms,
        calls
      };
    },

    // --------------------------
    // 5. New function for embeddings
    // --------------------------
    getAllSymbolsWithFile() {
      return db.prepare(
        `SELECT s.id as symbol_id, s.name, s.kind, f.path
           FROM symbols s
           JOIN files f ON s.file_id = f.id`
      ).all();
    },

    close() {
      db.close();
    }
  };
}
