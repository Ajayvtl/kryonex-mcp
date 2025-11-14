// src/system/toolRunner.mjs
import crypto from "crypto";

class ToolRunner {
  constructor({ taskManager, eventBus, db, semanticStore, validator, rectifier }) {
    this.taskManager = taskManager;
    this.eventBus = eventBus;
    this.db = db;
    this.semanticStore = semanticStore;
    this.validator = validator;
    this.rectifier = rectifier;
  }

  async call(toolHandlers, toolName, args, context) {
    if (!toolHandlers || !toolHandlers[toolName]) throw new Error("Unknown tool: " + toolName);
    const id = crypto.randomUUID();
    const meta = { id, toolName, args, startedAt: Date.now() };

    // Pre-validate the plan/args
    if (this.validator) {
      const ok = await this.validator.validateToolCall({ toolName, args, context });
      if (!ok.accepted) {
        // ask rectifier to propose changes
        if (this.rectifier) {
          const rectified = await this.rectifier.rectify({ toolName, args, context, reason: ok.reason });
          if (rectified && rectified.args) args = rectified.args;
          else throw new Error("Tool call rejected by validator and rectifier couldn't fix: " + ok.reason);
        } else {
          throw new Error("Tool call rejected by validator: " + ok.reason);
        }
      }
    }

    // stream "start"
    if (this.eventBus) this.eventBus.emit("tool.start", { ...meta });

    // run the tool while streaming logs (tool may expose event hooks; otherwise just run)
    const handler = toolHandlers[toolName];
    let result;
    let error = null;
    try {
      result = await handler(args, context, {
        onLog: (log) => {
          if (this.eventBus) this.eventBus.emit("tool.log", { id, toolName, log, ts: Date.now() });
        }
      });
    } catch (err) {
      error = String(err);
    }

    const finishedAt = Date.now();
    const record = { id, toolName, args, result, error, startedAt: meta.startedAt, finishedAt };

    // persist tool run
    if (this.db && this.db.saveToolRun) {
      try { await this.db.saveToolRun(record); } catch (e) { console.error("saveToolRun failed", e); }
    }

    // save short transcript to semantic store for RAG
    if (this.semanticStore && this.semanticStore.saveToolTranscript) {
      try {
        await this.semanticStore.saveToolTranscript({
          id, toolName, args, result: error ? { error } : result, ts: new Date().toISOString()
        });
      } catch (e) { console.error("saveToolTranscript failed", e); }
    }

    if (error) {
      if (this.eventBus) this.eventBus.emit("tool.error", { ...record });
      throw new Error(error);
    } else {
      if (this.eventBus) this.eventBus.emit("tool.end", { ...record });
      return result;
    }
  }
}

export default ToolRunner;
