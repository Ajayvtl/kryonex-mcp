import crypto from "crypto";

class TaskManager {
  /**
   * @param {object} [opts]
   * @param {any} [opts.db]
   * @param {import('./eventBus.mjs').default} [opts.eventBus]
   */
  constructor({ db = null, eventBus = null } = {}) {
    this.db = db;
    this.eventBus = eventBus;
    this.tasks = new Map();
  }

  _now() { return new Date().toISOString(); }

  async loadFromDb() {
    if (!this.db || typeof this.db.listTasks !== "function") return;
    try {
      const rows = await this.db.listTasks();
      for (const r of rows) {
        this.tasks.set(r.id, r);
      }
    } catch (e) { console.error("[TaskManager] loadFromDb", e); }
  }

  async createTask({ title = "untitled", parent = null, meta = {} } = {}) {
    const id = crypto.randomUUID();
    const t = {
      id, parent, title, status: "pending",
      steps: [], meta, result: null, error: null,
      createdAt: this._now(), updatedAt: this._now(),
    };
    this.tasks.set(id, t);
    if (this.db && typeof this.db.saveTask === "function") await this.db.saveTask(t);
    if (this.eventBus) await this.eventBus.emitPersisted("task.created", t);
    return t;
  }

  getTask(id) { return this.tasks.get(id) || null; }
  listTasks() { return Array.from(this.tasks.values()); }

  async updateTask(task) {
    task.updatedAt = this._now();
    this.tasks.set(task.id, task);
    if (this.db && typeof this.db.updateTask === "function") await this.db.updateTask(task);
    if (this.eventBus) await this.eventBus.emitPersisted("task.updated", task);
    return task;
  }

  async addStep(taskId, step = {}) {
    const t = this.getTask(taskId);
    if (!t) throw new Error("Task not found");
    const s = { id: crypto.randomUUID(), description: step.description || "step", status: step.status || "pending", createdAt: this._now(), meta: step.meta || {} };
    t.steps.push(s);
    await this.updateTask(t);
    if (this.eventBus) await this.eventBus.emitPersisted("task.step.added", { taskId, step: s });
    return s;
  }

  async startStep(taskId, stepId) {
    const t = this.getTask(taskId); if (!t) throw new Error("Task not found");
    const s = t.steps.find(x => x.id === stepId); if (!s) throw new Error("Step not found");
    s.status = "running"; s.startedAt = this._now();
    await this.updateTask(t);
    if (this.eventBus) await this.eventBus.emitPersisted("task.step.started", { taskId, stepId });
    return s;
  }

  async completeStep(taskId, stepId, result = null) {
    const t = this.getTask(taskId); if (!t) throw new Error("Task not found");
    const s = t.steps.find(x => x.id === stepId); if (!s) throw new Error("Step not found");
    s.status = "completed"; s.finishedAt = this._now(); s.result = result;
    await this.updateTask(t);
    if (this.eventBus) await this.eventBus.emitPersisted("task.step.completed", { taskId, stepId, result });
    return s;
  }

  async failStep(taskId, stepId, error = null) {
    const t = this.getTask(taskId); if (!t) throw new Error("Task not found");
    const s = t.steps.find(x => x.id === stepId); if (!s) throw new Error("Step not found");
    s.status = "failed"; s.finishedAt = this._now(); s.error = String(error);
    await this.updateTask(t);
    if (this.eventBus) await this.eventBus.emitPersisted("task.step.failed", { taskId, stepId, error: s.error });
    return s;
  }

  async completeTask(id, result = null) {
    const t = this.getTask(id); if (!t) throw new Error("Task not found");
    t.status = "completed"; t.result = result; t.updatedAt = this._now();
    await this.updateTask(t);
    if (this.eventBus) await this.eventBus.emitPersisted("task.completed", t);
    return t;
  }

  async failTask(id, error = null) {
    const t = this.getTask(id); if (!t) throw new Error("Task not found");
    t.status = "failed"; t.error = String(error); t.updatedAt = this._now();
    await this.updateTask(t);
    if (this.eventBus) await this.eventBus.emitPersisted("task.failed", t);
    return t;
  }
}

export default TaskManager;
