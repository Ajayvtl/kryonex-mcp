// src/agents/investigatorAgent.mjs
export default function createInvestigatorAgent({ toolRunner, taskManager }) {
  return {
    name: "investigatorAgent",
    async analyzeFailure({ file, line, error, context }) {
      // create a task
      const t = await taskManager.createTask({ title: `RCA: ${file}:${line}` });
      await taskManager.addStep(t.id, { description: "Locate symbol", tool: "language_lookup" });
      // call language lookup tool
      const symbol = await toolRunner.call(context.toolHandlers, "language_lookup", { file, line }, context);
      // call dependency graph
      const deps = await toolRunner.call(context.toolHandlers, "dependency_graph", { file }, context);
      // optionally run tests
      const testRes = await toolRunner.call(context.toolHandlers, "test_runner", { file }, context).catch(() => null);
      // basic composition
      const result = { symbol, deps, testRes };
      await taskManager.completeTask(t.id, result);
      return result;
    }
  };
}
