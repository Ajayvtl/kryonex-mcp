// src/system/eventBus.mjs
import EventEmitter from "events";

class EventBus extends EventEmitter {
  constructor({ db = null, semanticStore = null } = {}) {
    super();
    this.db = db;
    this.semanticStore = semanticStore;
  }

  /**
   * Emit an event and persist it if db.saveEvent exists.
   * payload should be serializable.
   */
  async emitPersisted(eventName, payload = {}) {
    try {
      // persist to DB for audit if available
      if (this.db && typeof this.db.saveEvent === "function") {
        try {
          await this.db.saveEvent({ eventName, payload, ts: new Date().toISOString() });
        } catch (err) {
          // don't block on persist failure
          console.error("[EventBus] saveEvent failed:", err);
        }
      }

      // Also optionally save a short transcript into semantic store for RAG
      if (this.semanticStore && typeof this.semanticStore.saveToolTranscript === "function") {
        try {
          await this.semanticStore.saveToolTranscript({
            id: `event-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
            eventName,
            payload,
            ts: new Date().toISOString(),
          });
        } catch (err) {
          // non-fatal
          console.error("[EventBus] semanticStore.saveToolTranscript failed:", err);
        }
      }
    } catch (e) {
      console.error("[EventBus] persist error:", e);
    }

    // emit to in-memory subscribers
    try {
      this.emit(eventName, payload);
    } catch (e) {
      console.error("[EventBus] emit error:", e);
    }
  }
}

export default EventBus;
