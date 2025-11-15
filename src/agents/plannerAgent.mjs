// src/agents/plannerAgent.mjs
/**
 * Planner Agent
 * - generatePlan(intent, context) -> uses ollamaTool to produce JSON plan
 * - planAndExecute(intent, context, opts) -> registers tasks and executes plan via workflowEngine + toolRunner
 *
 * Plan JSON expected: [ { id, description, tool, args, dependsOn: [] } ]
 */

/**
 * @param {object} [opts]
 * @param {any} [opts.ollamaTool]
 * @param {import('../system/workflowEngine.mjs').default} [opts.workflowEngine]
 * @param {import('../system/toolRunner.mjs').default} [opts.toolRunner]
 * @param {import('../system/taskManager.mjs').default} [opts.taskManager]
 * @param {import('../system/eventBus.mjs').default} [opts.eventBus]
 */
export default function createPlannerAgent({ ollamaTool = null, workflowEngine = null, toolRunner = null, taskManager = null, eventBus = null } = {}) {
  if (!ollamaTool || typeof ollamaTool.handler !== "function") {
    // Provide a fallback planner that errors explicitly to avoid silent surprises
    console.warn("[plannerAgent] Warning: ollamaTool missing - planner will not be able to generate LLM plans.");
  }

  return {
    name: "plannerAgent",

    async generatePlan(intent, context = {}, opts = {}) {
      if (!ollamaTool || typeof ollamaTool.handler !== "function") {
        throw new Error("PlannerAgent: ollamaTool not available");
      }

      const prompt = `
You are a planner. Given the user intent, return a JSON array of steps.
Each step: { "id": "step1", "description":"...", "tool":"tool_name", "args": {...}, "dependsOn": ["step0"] }

User intent:
${intent}

Return ONLY JSON.
`;
      const resp = await ollamaTool.handler({ prompt, mode: "plan" }, context);
      if (!resp || !resp.text) throw new Error("Planner LLM returned empty response");
      // Try parse
      try {
        const plan = JSON.parse(resp.text);
        if (!Array.isArray(plan)) throw new Error("Planner LLM did not return array");
        return plan;
      } catch (e) {
        // Try to extract JSON substring
        const m = resp.text.match(/\[[\s\S]*\]/);
        if (m) {
          try {
            const plan = JSON.parse(m[0]);
            if (Array.isArray(plan)) return plan;
          } catch (err) {
            // fallthrough
          }
        }
        throw new Error("PlannerAgent: failed to parse plan JSON - " + String(e));
      }
    },

    /**
     * planAndExecute orchestrates a plan:
     * - creates a main task
     * - creates subtasks for each step
     * - registers them with workflowEngine
     * - schedules their execution which calls tools via toolRunner
     */
    async planAndExecute(intent, context = {}, opts = {}) {
      // opts: { explainWhy, concurrency, maxSteps }
      if (!taskManager || !workflowEngine || !toolRunner) {
        throw new Error("PlannerAgent: missing required components (taskManager/workflowEngine/toolRunner)");
      }

      const mainTask = await taskManager.createTask({ title: intent, meta: { intent } });

      // generate plan
      const plan = await this.generatePlan(intent, context, opts);
      const steps = [];

      // map plan to internal step defs
      for (const p of plan.slice(0, opts.maxSteps || plan.length)) {
        const stepId = p.id || `step-${Math.random().toString(36).slice(2,9)}`;
        const stepTask = await taskManager.createTask({ title: p.description || p.tool || stepId, parent: mainTask.id, meta: { tool: p.tool, stepId } });
        await taskManager.addStep(mainTask.id, { description: p.description || p.tool, meta: { tool: p.tool, stepId } });

        // define fn to run via workflowEngine which calls toolRunner
        const fn = async () => {
          // mark step started in taskManager
          const addedStep = await taskManager.addStep(stepTask.id, { description: `execute ${p.tool}`, meta: { plan: true } });
          await taskManager.startStep(stepTask.id, addedStep.id).catch(() => {});
          // call tool via toolRunner
          const res = await toolRunner.call(context.toolHandlers || {}, p.tool, p.args || {}, context, { taskId: stepTask.id, stepId: addedStep.id });
          // complete step
          await taskManager.completeStep(stepTask.id, addedStep.id, res).catch(() => {});
          return res;
        };

        steps.push({
          id: stepTask.id,
          fn,
          dependsOn: (p.dependsOn || []).map((dep) => {
            // Resolve dep by mapping id names in plan to task ids if possible
            const matched = plan.find((pl) => pl.id === dep);
            if (matched) {
              // find corresponding created subtask id
              // assume order preserved: find index
              const idx = plan.indexOf(matched);
              const created = idx < plan.length ? plan[idx] : null;
            }
            // in this simple implementation, planner will not remap names; workflowEngine will trust dependsOn if it's taskId
            return dep;
          }),
          // allow per-step retry config
          retries: p.retries || undefined,
          timeoutMs: p.timeoutMs || undefined,
        });
      }

      // If plan steps used user-provided ids (not task ids), we need to remap dependencies to created task ids:
      // For reliability: remap step original IDs to created taskIds
      const idMap = {};
      for (let i = 0; i < plan.length && i < steps.length; i++) {
        const original = plan[i].id || null;
        if (original) idMap[original] = steps[i].id;
      }
      // remap dependsOn arrays
      for (const s of steps) {
        if (!Array.isArray(s.dependsOn)) s.dependsOn = [];
        s.dependsOn = s.dependsOn.map((d) => idMap[d] || d);
      }

      // schedule via workflowEngine
      await workflowEngine.runGraph(mainTask.id, steps);

      // mark main task completed once children settle — we poll children statuses
      // simple approach: wait briefly and then mark completed (or leave external)
      setTimeout(async () => {
        try {
          await taskManager.completeTask(mainTask.id, { message: "Plan scheduled" });
        } catch (e) {
          console.error("[PlannerAgent] complete main task failed:", e);
        }
      }, 200);

      return { taskId: mainTask.id, scheduledSteps: steps.map((s) => s.id) };
    },
  };
}
