// src/system/taskManager.mjs
import crypto from "crypto";

class TaskManager {
  constructor({ db = null, eventBus = null } = {}) {
    this.db = db;
    this.eventBus = eventBus;
    this.tasks = new Map(); // id -> task
  }

  _nowISO() {
    return new Date().toISOString();
  }

  /**
   * Load persisted tasks from DB into memory (if DB supports listTasks)
   */
  async loadFromDb() {
    if (!this.db || typeof this.db.listTasks !== "function") return;
    try {
      const list = await this.db.listTasks();
      if (Array.isArray(list)) {
        for (const t of list) {
          this.tasks.set(t.id, t);
        }
      }
    } catch (e) {
      console.error("[TaskManager] loadFromDb failed:", e);
    }
  }

  /**
   * createTask - creates and persists a task
   * { title, parent=null, meta={} }
   */
  async createTask({ title, parent = null, meta = {} } = {}) {
    const id = crypto.randomUUID();
    const task = {
      id,
      parent,
      title: title || "untitled",
      status: "pending", // pending | running | completed | failed | cancelled
      steps: [],
      meta,
      result: null,
      error: null,
      createdAt: this._nowISO(),
      updatedAt: this._nowISO(),
    };
    this.tasks.set(id, task);

    if (this.db && typeof this.db.saveTask === "function") {
      try {
        await this.db.saveTask(task);
      } catch (e) {
        console.error("[TaskManager] saveTask failed:", e);
      }
    }
    if (this.eventBus) {
      try { await this.eventBus.emitPersisted("task.created", task); } catch (e) { console.error(e); }
    }
    return task;
  }

  getTask(id) {
    return this.tasks.get(id) || null;
  }

  listTasks() {
    return Array.from(this.tasks.values());
  }

  async updateTask(task) {
    if (!task || !task.id) throw new Error("Invalid task");
    task.updatedAt = this._nowISO();
    this.tasks.set(task.id, task);
    if (this.db && typeof this.db.updateTask === "function") {
      try {
        await this.db.updateTask(task);
      } catch (e) {
        console.error("[TaskManager] updateTask failed:", e);
      }
    }
    if (this.eventBus) {
      try { await this.eventBus.emitPersisted("task.updated", task); } catch (e) { console.error(e); }
    }
    return task;
  }

  async setStatus(id, status) {
    const t = this.tasks.get(id);
    if (!t) throw new Error("Task not found: " + id);
    t.status = status;
    return await this.updateTask(t);
  }

  async addStep(taskId, step = {}) {
    const t = this.tasks.get(taskId);
    if (!t) throw new Error("Task not found: " + taskId);
    const stepObj = {
      id: crypto.randomUUID(),
      description: step.description || step.name || "step",
      status: step.status || "pending",
      startedAt: null,
      finishedAt: null,
      meta: step.meta || {},
      result: null,
      error: null,
      createdAt: this._nowISO(),
    };
    t.steps.push(stepObj);
    await this.updateTask(t);
    if (this.eventBus) {
      try { await this.eventBus.emitPersisted("task.step.added", { taskId, step: stepObj }); } catch (e) { console.error(e); }
    }
    return stepObj;
  }

  async startStep(taskId, stepId) {
    const t = this.tasks.get(taskId);
    if (!t) throw new Error("Task not found: " + taskId);
    const s = t.steps.find((x) => x.id === stepId);
    if (!s) throw new Error("Step not found: " + stepId);
    s.status = "running";
    s.startedAt = this._nowISO();
    await this.updateTask(t);
    if (this.eventBus) {
      try { await this.eventBus.emitPersisted("task.step.started", { taskId, stepId }); } catch (e) { console.error(e); }
    }
    return s;
  }

  async completeStep(taskId, stepId, result = null) {
    const t = this.tasks.get(taskId);
    if (!t) throw new Error("Task not found: " + taskId);
    const s = t.steps.find((x) => x.id === stepId);
    if (!s) throw new Error("Step not found: " + stepId);
    s.status = "completed";
    s.finishedAt = this._nowISO();
    s.result = result;
    await this.updateTask(t);
    if (this.eventBus) {
      try { await this.eventBus.emitPersisted("task.step.completed", { taskId, stepId, result }); } catch (e) { console.error(e); }
    }
    return s;
  }

  async failStep(taskId, stepId, error = null) {
    const t = this.tasks.get(taskId);
    if (!t) throw new Error("Task not found: " + taskId);
    const s = t.steps.find((x) => x.id === stepId);
    if (!s) throw new Error("Step not found: " + stepId);
    s.status = "failed";
    s.finishedAt = this._nowISO();
    s.error = typeof error === "string" ? error : String(error);
    await this.updateTask(t);
    if (this.eventBus) {
      try { await this.eventBus.emitPersisted("task.step.failed", { taskId, stepId, error: s.error }); } catch (e) { console.error(e); }
    }
    return s;
  }

  async completeTask(id, result = null) {
    const t = this.tasks.get(id);
    if (!t) throw new Error("Task not found: " + id);
    t.status = "completed";
    t.result = result;
    t.updatedAt = this._nowISO();
    await this.updateTask(t);
    if (this.eventBus) {
      try { await this.eventBus.emitPersisted("task.completed", t); } catch (e) { console.error(e); }
    }
    return t;
  }

  async failTask(id, error = null) {
    const t = this.tasks.get(id);
    if (!t) throw new Error("Task not found: " + id);
    t.status = "failed";
    t.error = typeof error === "string" ? error : String(error);
    t.updatedAt = this._nowISO();
    await this.updateTask(t);
    if (this.eventBus) {
      try { await this.eventBus.emitPersisted("task.failed", t); } catch (e) { console.error(e); }
    }
    return t;
  }
}

export default TaskManager;
