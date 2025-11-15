import EventEmitter from "events";

class EventBus extends EventEmitter {
  constructor({ db = null, semanticStore = null } = {}) {
    super();
    this.db = db;
    this.semanticStore = semanticStore;
  }

  async emitPersisted(name, payload = {}) {
    try {
      if (this.db && typeof this.db.saveEvent === "function") {
        await this.db.saveEvent({ eventName: name, payload, ts: new Date().toISOString() });
      }
    } catch (e) { console.error("[EventBus] saveEvent failed", e); }
    try {
      this.emit(name, payload);
    } catch (e) { console.error("[EventBus] emit failed", e); }
  }
}

export default EventBus;
