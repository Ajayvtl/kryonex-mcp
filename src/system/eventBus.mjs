// src/system/eventBus.mjs
import EventEmitter from "events";

class EventBus extends EventEmitter {
  constructor({db, semanticStore}) {
    super();
    this.db = db;
    this.semanticStore = semanticStore;
  }

  async emitPersisted(eventName, payload) {
    // Persist event to DB for audit trail (kryonexDb.saveEvent should exist)
    try {
      if (this.db && this.db.saveEvent) {
        await this.db.saveEvent({ eventName, payload, ts: Date.now() });
      }
    } catch (err) {
      // swallow persist errors but log
      console.error("eventBus.persist error", err);
    }
    this.emit(eventName, payload);
  }
}

export default EventBus;
