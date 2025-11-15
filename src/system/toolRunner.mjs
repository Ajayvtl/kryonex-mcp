import crypto from "crypto";

class ToolRunner {
  /**
   * @param {object} [opts]
   * @param {import('./taskManager.mjs').default} [opts.taskManager]
   * @param {import('./eventBus.mjs').default} [opts.eventBus]
   * @param {any} [opts.db]
   * @param {any} [opts.semanticStore]
   * @param {any} [opts.validator]
   * @param {any} [opts.rectifier]
   */
  constructor({ taskManager = null, eventBus = null, db = null, semanticStore = null, validator = null, rectifier = null } = {}) {
    this.taskManager = taskManager; this.eventBus = eventBus; this.db = db; this.semanticStore = semanticStore; this.validator = validator; this.rectifier = rectifier;
  }

  _now() { return new Date().toISOString(); }

  async _persistRun(record) {
    if (!this.db || typeof this.db.saveToolRun !== "function") return;
    try { await this.db.saveToolRun(record); } catch (e) { console.error("[ToolRunner] saveToolRun failed", e); }
  }

  async _saveTranscript(transcript) {
    if (!this.semanticStore || typeof this.semanticStore.saveToolTranscript !== "function") return;
    try { await this.semanticStore.saveToolTranscript(transcript); } catch (e) { console.error("[ToolRunner] saveTranscript failed", e); }
  }

  async call(toolHandlers, toolName, args = {}, context = {}, options = {}) {
    const id = crypto.randomUUID(); const startedAt = this._now();
    // validate
    if (this.validator && typeof this.validator.validateToolCall === "function") {
      const v = await this.validator.validateToolCall({ toolName, args, context });
      if (!v || v.accepted === false) {
        if (this.rectifier && typeof this.rectifier.rectify === "function") {
          const rect = await this.rectifier.rectify({ toolName, args, context, reason: v && v.reason ? v.reason : "rejected" });
          if (rect && rect.args) args = rect.args; else throw new Error("Tool call rejected by validator and rectifier could not fix: " + (v && v.reason ? v.reason : "rejected"));
        } else throw new Error("Tool call rejected by validator: " + (v && v.reason ? v.reason : "rejected"));
      }
    }

    if (this.eventBus) await this.eventBus.emitPersisted("tool.start", { id, toolName, args, ts: startedAt });

    const handler = toolHandlers[toolName];
    if (typeof handler !== "function") throw new Error("Unknown tool: " + toolName);

    const onLog = (m) => { try { if (this.eventBus) this.eventBus.emit("tool.log", { id, toolName, log: m, ts: new Date().toISOString() }); if (options.onProgress) options.onProgress(m); } catch (e) {} };

    let result = null; let error = null;
    try {
      // handler signature: handler(args, context, { onLog })
      result = await handler(args, context, { onLog });
    } catch (e) {
      error = String(e);
    }

    const finishedAt = this._now();
    const record = { id, toolName, args, result: error ? null : result, error, startedAt, finishedAt, durationMs: Date.parse(finishedAt) - Date.parse(startedAt), contextMeta: { projectRoot: context?.projectRoot || null } };

    await this._persistRun(record).catch(() => {});
    await this._saveTranscript({ id, toolName, args, result: error ? { error } : result, ts: finishedAt }).catch(() => {});

    if (error) {
      if (this.eventBus) await this.eventBus.emitPersisted("tool.error", record);
      throw new Error(error);
    } else {
      if (this.eventBus) await this.eventBus.emitPersisted("tool.end", record);
      return result;
    }
  }
}

export default ToolRunner;
