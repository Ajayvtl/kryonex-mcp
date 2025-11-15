// src/system/workflowEngine.mjs
import { setTimeout as wait } from "timers/promises";

/**
 * Lightweight WorkflowEngine implementing:
 * - registration of nodes (tasks)
 * - dependency graph (edges)
 * - scheduling with configurable concurrency (internal queue)
 * - retry wrapper support
 *
 * No external deps. Designed for production but simple to reason about.
 */

class SimpleQueue {
  constructor(concurrency = 4) {
    this.concurrency = Math.max(1, concurrency || 4);
    this.running = 0;
    this.queue = [];
  }

  async add(fn) {
    return new Promise((resolve, reject) => {
      const run = async () => {
        this.running++;
        try {
          const res = await fn();
          this.running--;
          this._next();
          resolve(res);
        } catch (err) {
          this.running--;
          this._next();
          reject(err);
        }
      };

      if (this.running < this.concurrency) run();
      else this.queue.push(run);
    });
  }

  _next() {
    if (this.queue.length > 0 && this.running < this.concurrency) {
      const fn = this.queue.shift();
      fn();
    }
  }

  size() {
    return this.queue.length;
  }
}

class WorkflowEngine {
  /**
   * @param {object} [opts]
   * @param {import('./taskManager.mjs').default} [opts.taskManager]
   * @param {import('./eventBus.mjs').default} [opts.eventBus]
   * @param {any} [opts.db]
   * @param {number} [opts.concurrency]
   */
  constructor({ taskManager, eventBus, db = null, concurrency = 4 } = {}) {
    this.taskManager = taskManager;
    this.eventBus = eventBus;
    this.db = db;
    this.queue = new SimpleQueue(concurrency);
    this.graph = new Map(); // taskId -> { deps: Set, dependents: Set }
  }

  _ensureNode(id) {
    if (!this.graph.has(id)) this.graph.set(id, { deps: new Set(), dependents: new Set() });
  }

  async registerTask(task) {
    if (!task || !task.id) throw new Error("Invalid task for registerTask");
    this._ensureNode(task.id);
    if (this.db && typeof this.db.saveWorkflowNode === "function") {
      try { await this.db.saveWorkflowNode(task); } catch (e) { console.error("[WorkflowEngine] saveWorkflowNode failed", e); }
    }
    return task;
  }

  addDependency(taskId, dependsOnTaskId) {
    this._ensureNode(taskId);
    this._ensureNode(dependsOnTaskId);
    this.graph.get(taskId).deps.add(dependsOnTaskId);
    this.graph.get(dependsOnTaskId).dependents.add(taskId);
  }

  /**
   * Wait for dependencies to be completed (polling).
   * Timeout is optional ms (default 2min)
   */
  async _waitForDeps(deps = [], timeoutMs = 120000) {
    const start = Date.now();
    for (const dep of deps) {
      while (true) {
        const dTask = this.taskManager.getTask(dep);
        if (!dTask) break; // if unknown, skip
        if (dTask.status === "completed") break;
        if (dTask.status === "failed") throw new Error(`Dependency ${dep} failed`);
        if (Date.now() - start > timeoutMs) throw new Error(`Timeout waiting for dependency ${dep}`);
        await wait(250);
      }
    }
  }

  /**
   * Wrap a function with retry policy
   */
  async _withRetry(fn, { retries = 3, backoffMs = 500 } = {}) {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (err) {
        attempt++;
        if (attempt > retries) throw err;
        const waitMs = backoffMs * Math.pow(2, attempt - 1);
        await wait(waitMs);
      }
    }
  }

  /**
   * Schedule a task function for execution after dependencies are satisfied.
   * fn should be an async function returning result.
   */
  async scheduleTask(taskId, fn, { dependsOn = [], retries = 2, timeoutMs = 120000 } = {}) {
    await this.registerTask({ id: taskId });
    for (const d of dependsOn || []) this.addDependency(taskId, d);

    // create a wrapper that waits for deps then runs the function in queue
    const wrapper = async () => {
      await this._waitForDeps(dependsOn || [], timeoutMs);
      if (this.eventBus) this.eventBus.emit("workflow.task.starting", { taskId, deps: dependsOn });
      const res = await this._withRetry(fn, { retries, backoffMs: 500 });
      if (this.eventBus) this.eventBus.emit("workflow.task.finished", { taskId, result: res });
      return res;
    };

    return this.queue.add(wrapper);
  }

  /**
   * Run a set of steps (array of { id, fn, dependsOn })
   * Returns Promise.allSettled of scheduled tasks.
   */
  async runGraph(rootTaskId, steps = [], opts = {}) {
    // register and wire dependencies
    for (const s of steps) {
      await this.registerTask({ id: s.id });
      for (const d of s.dependsOn || []) this.addDependency(s.id, d);
    }
    const promises = steps.map((s) => {
      return this.scheduleTask(s.id, s.fn, { dependsOn: s.dependsOn || [], retries: s.retries || 2, timeoutMs: s.timeoutMs || 120000 });
    });
    return Promise.allSettled(promises);
  }
}

export default WorkflowEngine;
