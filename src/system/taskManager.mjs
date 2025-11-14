// src/system/taskManager.mjs
import crypto from "crypto";

class TaskManager {
  constructor({ db, eventBus }) {
    this.db = db;
    this.eventBus = eventBus;
    this.tasks = new Map(); // id => task
  }

  async loadFromDb() {
    if (!this.db || !this.db.listTasks) return;
    try {
      const tasks = await this.db.listTasks();
      for (const t of tasks) this.tasks.set(t.id, t);
    } catch (err) {
      console.error("TaskManager.loadFromDb", err);
    }
  }

  _now() { return new Date().toISOString(); }

  async createTask({ title, parent = null, meta = {} }) {
    const id = crypto.randomUUID();
    const task = {
      id, parent, title,
      status: "pending", // pending | running | completed | failed | cancelled
      createdAt: this._now(),
      updatedAt: this._now(),
      steps: [],
      meta,
      result: null,
      error: null
    };
    this.tasks.set(id, task);
    if (this.db && this.db.saveTask) await this.db.saveTask(task);
    if (this.eventBus) await this.eventBus.emitPersisted("task.created", task);
    return task;
  }

  async updateTask(task) {
    task.updatedAt = this._now();
    this.tasks.set(task.id, task);
    if (this.db && this.db.updateTask) await this.db.updateTask(task);
    if (this.eventBus) await this.eventBus.emitPersisted("task.updated", task);
    return task;
  }

  async setStatus(id, status) {
    const t = this.tasks.get(id);
    if (!t) throw new Error("Task not found: " + id);
    t.status = status;
    await this.updateTask(t);
    return t;
  }

  async addStep(id, step) {
    const t = this.tasks.get(id);
    if (!t) throw new Error("Task not found: " + id);
    step.id = crypto.randomUUID();
    step.createdAt = this._now();
    t.steps.push(step);
    await this.updateTask(t);
    if (this.eventBus) await this.eventBus.emitPersisted("task.step.added", { taskId: id, step });
    return step;
  }

  getTask(id) { return this.tasks.get(id); }

  listTasks() { return Array.from(this.tasks.values()); }

  async completeTask(id, result = null) {
    const t = await this.setStatus(id, "completed");
    t.result = result;
    await this.updateTask(t);
    if (this.eventBus) await this.eventBus.emitPersisted("task.completed", t);
    return t;
  }

  async failTask(id, error) {
    const t = this.tasks.get(id);
    if (!t) throw new Error("Task not found: " + id);
    t.status = "failed";
    t.error = (typeof error === "string" ? error : String(error));
    await this.updateTask(t);
    if (this.eventBus) await this.eventBus.emitPersisted("task.failed", t);
    return t;
  }
}

export default TaskManager;
