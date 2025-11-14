// src/system/workflowEngine.mjs
import { default as PQueue } from "p-queue"; // lightweight concurrency queue (install if missing)

class WorkflowEngine {
  constructor({ taskManager, eventBus, concurrency = 3, db }) {
    this.taskManager = taskManager;
    this.eventBus = eventBus;
    this.db = db;
    this.queue = new PQueue({ concurrency });
    // graph: taskId -> { deps: Set(taskId), dependents: Set(taskId) }
    this.graph = new Map();
  }

  async registerTask(task) {
    if (!task || !task.id) throw new Error("Invalid task");
    if (!this.graph.has(task.id)) this.graph.set(task.id, { deps: new Set(), dependents: new Set() });
    // persist graph info if needed
    if (this.db && this.db.saveWorkflowNode) await this.db.saveWorkflowNode(task);
  }

  addDependency(taskId, dependsOnTaskId) {
    if (!this.graph.has(taskId)) this.registerTask({ id: taskId });
    if (!this.graph.has(dependsOnTaskId)) this.registerTask({ id: dependsOnTaskId });
    this.graph.get(taskId).deps.add(dependsOnTaskId);
    this.graph.get(dependsOnTaskId).dependents.add(taskId);
  }

  // run a task only when all dependencies are completed
  async scheduleTask(taskId, fn) {
    await this.registerTask({ id: taskId });
    const deps = Array.from(this.graph.get(taskId).deps || []);
    // wait for dependencies to complete by checking task statuses
    await Promise.all(deps.map(async (d) => {
      const depTask = this.taskManager.getTask(d);
      if (!depTask) return;
      // if dep failed -> propagate failure early
      if (depTask.status === "failed") throw new Error(`Dependency failed: ${d}`);
      if (depTask.status !== "completed") {
        // poll until completed/failed (simple approach)
        await new Promise((resolve, reject) => {
          const check = async () => {
            const up = this.taskManager.getTask(d);
            if (!up) return resolve();
            if (up.status === "completed") return resolve();
            if (up.status === "failed") return reject(new Error(`Dependency failed: ${d}`));
            setTimeout(check, 250);
          };
          check();
        });
      }
    }));

    // enqueue execution
    return this.queue.add(async () => {
      await this.taskManager.setStatus(taskId, "running");
      if (this.eventBus) this.eventBus.emit("workflow.task.started", { taskId });
      try {
        const res = await fn();
        await this.taskManager.completeTask(taskId, res);
        if (this.eventBus) this.eventBus.emit("workflow.task.completed", { taskId, res });
        return res;
      } catch (err) {
        await this.taskManager.failTask(taskId, String(err));
        if (this.eventBus) this.eventBus.emit("workflow.task.failed", { taskId, err: String(err) });
        throw err;
      }
    });
  }

  // basic utility to run many tasks with dependency wiring
  async runGraph(rootTaskId, steps) {
    // steps is array of { id, fn, dependsOn: [] }
    for (const s of steps) {
      await this.registerTask({ id: s.id });
      for (const d of s.dependsOn || []) this.addDependency(s.id, d);
    }
    // schedule all tasks
    const promises = steps.map(s => this.scheduleTask(s.id, s.fn));
    return Promise.allSettled(promises);
  }
}

export default WorkflowEngine;
