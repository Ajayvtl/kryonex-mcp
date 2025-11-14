// src/system/toolRunner.mjs
import crypto from "crypto";

/**
 * ToolRunner
 * - Central wrapper to call tools
 * - Runs validator.validateToolCall (if available)
 * - Calls rectifier.rectify(...) if validator rejects
 * - Emits start/log/end events via eventBus
 * - Persists tool run to db.saveToolRun if available
 * - Stores a short transcript to semanticStore.saveToolTranscript if available
 *
 * handler signature expected by tool modules:
 *   handler(args, context, options)
 * where options may provide onLog callback
 */

class ToolRunner {
  constructor({ taskManager = null, eventBus = null, db = null, semanticStore = null, validator = null, rectifier = null } = {}) {
    this.taskManager = taskManager;
    this.eventBus = eventBus;
    this.db = db;
    this.semanticStore = semanticStore;
    this.validator = validator;
    this.rectifier = rectifier;
  }

  _nowISO() {
    return new Date().toISOString();
  }

  async _persistRun(record) {
    if (!this.db) return;
    if (typeof this.db.saveToolRun === "function") {
      try {
        await this.db.saveToolRun(record);
      } catch (e) {
        console.error("[ToolRunner] db.saveToolRun failed:", e);
      }
    } else {
      // try generic save
      try {
        if (typeof this.db.insert === "function") await this.db.insert("tool_runs", record);
      } catch (e) {
        // ignore
      }
    }
  }

  async _saveTranscript(transcript) {
    if (!this.semanticStore) return;
    try {
      if (typeof this.semanticStore.saveToolTranscript === "function") {
        await this.semanticStore.saveToolTranscript(transcript);
      } else if (typeof this.semanticStore.upsert === "function") {
        await this.semanticStore.upsert(transcript);
      }
    } catch (e) {
      console.error("[ToolRunner] semanticStore.saveToolTranscript failed:", e);
    }
  }

  /**
   * Main call entry
   * toolHandlers: map name -> function
   * toolName: string
   * args: object
   * context: object passed to tool handlers
   * options: { taskId, stepId, onProgress } optional
   */
  async call(toolHandlers, toolName, args = {}, context = {}, options = {}) {
    const id = crypto.randomUUID();
    const startedAt = this._nowISO();
    const meta = { id, toolName, args, startedAt };
    // validate
    if (this.validator && typeof this.validator.validateToolCall === "function") {
      try {
        const v = await this.validator.validateToolCall({ toolName, args, context });
        if (!v || v.accepted === false) {
          // try rectifier
          if (this.rectifier && typeof this.rectifier.rectify === "function") {
            const rect = await this.rectifier.rectify({ toolName, args, context, reason: v && v.reason ? v.reason : "validation_rejected" });
            if (rect && rect.args) {
              args = rect.args;
            } else {
              throw new Error(`ToolRunner: call rejected by validator: ${v && v.reason ? v.reason : "rejected"}`);
            }
          } else {
            throw new Error(`ToolRunner: call rejected by validator: ${v && v.reason ? v.reason : "rejected"}`);
          }
        }
      } catch (err) {
        throw new Error("Validation failed: " + String(err));
      }
    }

    // emit start
    if (this.eventBus) {
      try { await this.eventBus.emitPersisted("tool.start", meta); } catch (e) { console.error(e); }
    }

    const handler = toolHandlers[toolName];
    if (typeof handler !== "function") {
      const err = new Error("Unknown tool: " + toolName);
      if (this.eventBus) this.eventBus.emit("tool.error", { id, toolName, error: String(err), ts: this._nowISO() });
      throw err;
    }

    // provide onLog via options
    const onLog = (log) => {
      try {
        if (this.eventBus) this.eventBus.emit("tool.log", { id, toolName, log, ts: new Date().toISOString() });
        if (typeof options.onProgress === "function") options.onProgress(log);
      } catch (e) {
        // swallow
      }
    };

    let result = null;
    let error = null;
    try {
      // Handler may accept (args, context, {onLog})
      result = await handler(args, context, { onLog });
    } catch (err) {
      error = String(err);
    }

    const finishedAt = this._nowISO();
    const record = {
      id,
      toolName,
      args,
      result: error ? null : result,
      error,
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      contextMeta: {
        projectRoot: context?.projectRoot || null,
      },
    };

    try { await this._persistRun(record); } catch (e) { /* ignore */ }
    try { await this._saveTranscript({ id, toolName, args, result: error ? { error } : result, ts: finishedAt }); } catch (e) { /* ignore */ }

    if (error) {
      if (this.eventBus) {
        try { await this.eventBus.emitPersisted("tool.error", record); } catch (e) { console.error(e); }
      }
      throw new Error(error);
    } else {
      if (this.eventBus) {
        try { await this.eventBus.emitPersisted("tool.end", record); } catch (e) { console.error(e); }
      }
      return result;
    }
  }
}

export default ToolRunner;
