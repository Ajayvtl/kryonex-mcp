// src/agents/investigatorAgent.mjs
/**
 * Investigator Agent - performs root cause analysis (RCA)
 * Uses the language lookup, dependency graph, test runner tools via toolRunner
 */

export default function createInvestigatorAgent({ toolRunner = null, taskManager = null, eventBus = null } = {}) {
  if (!toolRunner) console.warn("[investigatorAgent] warning: toolRunner not provided");

  return {
    name: "investigatorAgent",

    /**
     * analyzeFailure - accepts { file, line, error, stack } and context
     * Returns an RCA report object
     */
    async analyzeFailure({ file = null, line = null, error = null, stack = null } = {}, context = {}) {
      if (!taskManager) throw new Error("investigatorAgent requires taskManager");
      const t = await taskManager.createTask({ title: `RCA: ${file || "unknown"}`, meta: { file, line } });

      try {
        await taskManager.addStep(t.id, { description: "Locate symbol (language_lookup)", meta: {} });

        // language lookup (optional)
        let symbol = null;
        try {
          symbol = await toolRunner.call(context.toolHandlers || {}, "language_lookup", { file, line }, context);
          await taskManager.addStep(t.id, { description: "language_lookup done", meta: {} });
        } catch (e) {
          await taskManager.addStep(t.id, { description: "language_lookup failed", meta: { error: String(e) } });
        }

        // dependency graph
        let deps = null;
        try {
          deps = await toolRunner.call(context.toolHandlers || {}, "dependency_graph", { file }, context);
          await taskManager.addStep(t.id, { description: "dependency_graph done", meta: {} });
        } catch (e) {
          await taskManager.addStep(t.id, { description: "dependency_graph failed", meta: { error: String(e) } });
        }

        // run tests (best-effort)
        let testRes = null;
        try {
          testRes = await toolRunner.call(context.toolHandlers || {}, "test_runner", { file }, context);
          await taskManager.addStep(t.id, { description: "test_runner done", meta: {} });
        } catch (e) {
          await taskManager.addStep(t.id, { description: "test_runner failed or not present", meta: { error: String(e) } });
        }

        // compose RCA basic report
        const report = {
          file,
          line,
          error,
          symbol,
          deps,
          testRes,
          timestamp: new Date().toISOString(),
        };

        await taskManager.completeTask(t.id, report);
        if (eventBus) await eventBus.emitPersisted("investigator.report", { taskId: t.id, report });

        return report;
      } catch (e) {
        await taskManager.failTask(t.id, String(e));
        throw e;
      }
    },
  };
}
