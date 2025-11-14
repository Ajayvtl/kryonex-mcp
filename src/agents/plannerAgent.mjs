// src/agents/plannerAgent.mjs
export default function createPlannerAgent({ ollamaTool, workflowEngine, toolRunner, taskManager, eventBus }) {
  return {
    name: "plannerAgent",

    // intent => plan (array of steps)
    async generatePlan(intent, context, opts = {}) {
      const prompt = `
You are a planner. Given intent: ${intent}
Return JSON: [{ "id":"step1", "description":"...", "tool":"tool_name", "args": {...}, "dependsOn": [] }]
`;
      const resp = await ollamaTool.handler({ prompt, mode: "plan" }, context);
      try {
        return JSON.parse(resp.text);
      } catch (e) {
        throw new Error("Planner LLM returned invalid JSON");
      }
    },

    // orchestration entrypoint
    async planAndExecute(intent, context, opts = {}) {
      const mainTask = await taskManager.createTask({ title: intent, meta: { intent } });
      const plan = await this.generatePlan(intent, context, opts);

      // register steps in workflow graph
      const steps = plan.map(p => ({
        id: p.id || (`step-${Math.random().toString(36).slice(2,9)}`),
        dependsOn: p.dependsOn || [],
        fn: async () => {
          // add step to taskManager and call tool via runner
          const stepTask = await taskManager.createTask({ title: p.description, parent: mainTask.id, meta: { tool: p.tool } });
          await taskManager.addStep(mainTask.id, { stepId: stepTask.id, description: p.description });
          // call tool via toolRunner
          const res = await toolRunner.call(context.toolHandlers, p.tool, p.args || {}, context);
          return res;
        }
      }));

      // schedule steps using workflowEngine
      await workflowEngine.runGraph(mainTask.id, steps);
      // final: mark main task complete if all children succeeded
      const final = await taskManager.completeTask(mainTask.id, { message: "Plan executed (partial results may exist)" });
      return final;
    }
  };
}
