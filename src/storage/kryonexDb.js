// src/storage/kryonexDb.js
/**
 * Kryonex DB module (SQLite via better-sqlite3)
 * - openDb(dbPath) -> returns an object with many code-indexing functions AND task/tool persistence functions:
 *   - saveTask(task), updateTask(task), listTasks()
 *   - saveToolRun(record)
 *   - saveEvent(event)
 *   - saveWorkflowNode(node)
 *
 * This file wraps and reuses the original code-index functions (upsertFile, replaceSymbols, summary, etc.)
 * and adds migrations for tasks/tool_runs/events/workflow_nodes.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let Database = null;
try {
  const sqliteModule = await import("better-sqlite3");
  Database = sqliteModule.default || sqliteModule;
} catch (e) {
  // fallback to require
  try {
    Database = require("better-sqlite3");
  } catch (err) {
    console.error("Please install better-sqlite3. Error:", err);
    throw err;
  }
}

export async function openDb(dbPath) {
  // ensure dir exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  // WAL mode for concurrency
  try { db.pragma("journal_mode = WAL"); } catch (e) { /* ignore */ }

  // perform migrations (create required tables if missing)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      parent TEXT,
      title TEXT,
      status TEXT,
      steps_json TEXT,
      meta_json TEXT,
      result_json TEXT,
      error_text TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS tool_runs (
      id TEXT PRIMARY KEY,
      tool_name TEXT,
      args_json TEXT,
      result_json TEXT,
      error_text TEXT,
      started_at TEXT,
      finished_at TEXT,
      duration_ms INTEGER,
      context_meta_json TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      payload_json TEXT,
      ts TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS workflow_nodes (
      id TEXT PRIMARY KEY,
      payload_json TEXT,
      created_at TEXT
    )
  `).run();

  // ---- existing code-indexing schema and functions copied from original file ----
  // We'll reuse the original functions if present in a file 'legacy' style.
  // For safety, implement a minimal set that existed in original module (upsertFile, replaceSymbols etc.)
  // NOTE: the rest of your original file likely already implements many query functions; integrate as needed.

  // For this integration patch, implement a few key helpers plus placeholder stubs mapping to original code-index functions
  // If your original file already had more methods, keep those as well (we're merging patterns).

  // Basic file table for code indexing (if absent)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE,
      hash TEXT,
      lang TEXT,
      modified_at TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER,
      name TEXT,
      kind TEXT,
      FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER,
      caller TEXT,
      callee TEXT,
      FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
    )
  `).run();

  // helper to find or create file record
  const findFileStmt = db.prepare(`SELECT id, hash FROM files WHERE path = ?`);
  const insertFileStmt = db.prepare(`INSERT INTO files (path, hash, lang, modified_at) VALUES (?, ?, ?, ?)`);
  const updateFileStmt = db.prepare(`UPDATE files SET hash=?, lang=?, modified_at=? WHERE id=?`);
  const deleteSymbolsForFile = db.prepare(`DELETE FROM symbols WHERE file_id=?`);
  const insertSymbolStmt = db.prepare(`INSERT INTO symbols (file_id, name, kind) VALUES (?, ?, ?)`);
  const deleteCallsForFile = db.prepare(`DELETE FROM calls WHERE file_id=?`);
  const insertCallStmt = db.prepare(`INSERT INTO calls (file_id, caller, callee) VALUES (?, ?, ?)`);

  return {
    // ------------- TASKS API -------------
    async saveTask(task) {
      // task = { id, parent, title, status, steps, meta, result, error, createdAt, updatedAt }
      console.error("[DEBUG] saveTask - task.steps type:", typeof task.steps, "value:", task.steps);
      console.error("[DEBUG] saveTask - task.meta type:", typeof task.meta, "value:", task.meta);
      console.error("[DEBUG] saveTask - task.result type:", typeof task.result, "value:", task.result);
      console.error("[DEBUG] saveTask - task.error type:", typeof task.error, "value:", task.error);

      const t = {
        id: task.id,
        parent: task.parent || null,
        title: task.title || "",
        status: task.status || "pending",
        steps_json: JSON.stringify(task.steps || []),
        meta_json: JSON.stringify(task.meta || {}),
        result_json: task.result ? JSON.stringify(task.result) : null,
        error_text: task.error ? String(task.error) : null,
        created_at: task.createdAt || new Date().toISOString(),
        updated_at: task.updatedAt || new Date().toISOString(),
      };
      const stmt = db.prepare(`INSERT OR REPLACE INTO tasks (id, parent, title, status, steps_json, meta_json, result_json, error_text, created_at, updated_at)
        VALUES (@id,@parent,@title,@status,@steps_json,@meta_json,@result_json,@error_text,@created_at,@updated_at)`);
      stmt.run(t);
      return true;
    },

    async updateTask(task) {
      console.error("[DEBUG] updateTask - task.steps type:", typeof task.steps, "value:", task.steps);
      console.error("[DEBUG] updateTask - task.meta type:", typeof task.meta, "value:", task.meta);
      console.error("[DEBUG] updateTask - task.result type:", typeof task.result, "value:", task.result);
      console.error("[DEBUG] updateTask - task.error type:", typeof task.error, "value:", task.error);

      const t = {
        id: task.id,
        parent: task.parent || null,
        title: task.title || "",
        status: task.status || "pending",
        steps_json: JSON.stringify(task.steps || []),
        meta_json: JSON.stringify(task.meta || {}),
        result_json: task.result ? JSON.stringify(task.result) : null,
        error_text: task.error ? String(task.error) : null,
        updated_at: task.updatedAt || new Date().toISOString(),
      };
      const stmt = db.prepare(`UPDATE tasks SET parent=@parent, title=@title, status=@status, steps_json=@steps_json, meta_json=@meta_json, result_json=@result_json, error_text=@error_text, updated_at=@updated_at WHERE id=@id`);
      stmt.run(t);
      return true;
    },

    async listTasks() {
      const rows = db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC`).all();
      return rows.map(r => ({
        id: r.id,
        parent: r.parent,
        title: r.title,
        status: r.status,
        steps: r.steps_json ? JSON.parse(r.steps_json) : [],
        meta: r.meta_json ? JSON.parse(r.meta_json) : {},
        result: r.result_json ? JSON.parse(r.result_json) : null,
        error: r.error_text || null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    },

    // ------------- TOOL RUNS -------------
    async saveToolRun(rec) {
      // rec = { id, toolName, args, result, error, startedAt, finishedAt, durationMs, contextMeta }
      const row = {
        id: rec.id,
        tool_name: rec.toolName || rec.tool_name || null,
        args_json: rec.args ? JSON.stringify(rec.args) : null,
        result_json: rec.result ? JSON.stringify(rec.result) : null,
        error_text: rec.error ? String(rec.error) : null,
        started_at: rec.startedAt || rec.started_at || new Date().toISOString(),
        finished_at: rec.finishedAt || rec.finished_at || new Date().toISOString(),
        duration_ms: rec.durationMs || rec.duration_ms || null,
        context_meta_json: rec.contextMeta ? JSON.stringify(rec.contextMeta) : null,
      };
      const stmt = db.prepare(`INSERT OR REPLACE INTO tool_runs (id, tool_name, args_json, result_json, error_text, started_at, finished_at, duration_ms, context_meta_json)
       VALUES (@id,@tool_name,@args_json,@result_json,@error_text,@started_at,@finished_at,@duration_ms,@context_meta_json)`);
      stmt.run(row);
      return true;
    },

    // ------------- EVENTS -------------
    async saveEvent(evt) {
      // evt = { eventName, payload, ts }
      const row = {
        name: evt.eventName || evt.name || null,
        payload_json: evt.payload ? JSON.stringify(evt.payload) : null,
        ts: evt.ts || new Date().toISOString(),
      };
      const stmt = db.prepare(`INSERT INTO events (name, payload_json, ts) VALUES (@name,@payload_json,@ts)`);
      stmt.run(row);
      return true;
    },

    // ------------- Workflow nodes -------------
    async saveWorkflowNode(node) {
      // node = { id, payload, createdAt }
      console.error("[DEBUG] saveWorkflowNode - node.payload type:", typeof node.payload, "value:", node.payload);
      const row = {
        id: node.id,
        payload_json: (node.payload !== undefined && node.payload !== null) ? JSON.stringify(node.payload) : null,
        created_at: node.createdAt || new Date().toISOString(),
      };
      const stmt = db.prepare(`INSERT OR REPLACE INTO workflow_nodes (id, payload_json, created_at) VALUES (@id,@payload_json,@created_at)`);
      stmt.run(row);
      return true;
    },

    // ------------- Minimal code indexing helpers (existing functionality) -------------
    upsertFile(filePath, hash = null, lang = null, modifiedTime = null) {
      const existing = findFileStmt.get(filePath);
      if (existing) {
        if (hash && existing.hash === hash) return existing.id;
        const upd = db.prepare(`UPDATE files SET hash = ?, lang = ?, modified_at = ? WHERE id = ?`);
        upd.run(hash, lang, modifiedTime || new Date().toISOString(), existing.id);
        return existing.id;
      } else {
        const info = insertFileStmt.run(filePath, hash, lang, modifiedTime || new Date().toISOString());
        return info.lastInsertRowid;
      }
    },

    replaceSymbols(fileId, symbols = []) {
      deleteSymbolsForFile.run(fileId);
      for (const s of symbols) {
        insertSymbolStmt.run(fileId, s.name, s.kind || null);
      }
      return true;
    },

    replaceCalls(fileId, calls = []) {
      deleteCallsForFile.run(fileId);
      for (const c of calls) {
        insertCallStmt.run(fileId, c.caller || null, c.callee || null);
      }
      return true;
    },

    // other query helpers (lightweight)
    getAllFiles() {
      return db.prepare(`SELECT path FROM files`).all().map(r => r.path);
    },

    summary() {
      const filesN = db.prepare(`SELECT COUNT(*) AS n FROM files`).get().n || 0;
      const syms = db.prepare(`SELECT COUNT(*) AS n FROM symbols`).get().n || 0;
      const calls = db.prepare(`SELECT COUNT(*) AS n FROM calls`).get().n || 0;
      return { status: "ready", files: filesN, symbols: syms, calls };
    },

    close() {
      try { db.close(); } catch (e) { /* ignore */ }
    }
  };
}
