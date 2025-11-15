export default function createRectifier({ ollamaTool = null } = {}) {
  return {
    async rectify({ toolName, args, context, reason } = {}) {
      if (!ollamaTool || typeof ollamaTool.handler !== "function") return null;
      try {
        const prompt = `Rectifier: please propose corrected args JSON or {"rejected":true} for tool ${toolName}, reason: ${reason}, args: ${JSON.stringify(args)}`;
        const resp = await ollamaTool.handler({ prompt, mode: "rectify" }, context);
        if (!resp || !resp.text) return null;
        try { return JSON.parse(resp.text); } catch (e) {
          const m = resp.text.match(/\{[\s\S]*\}/); if (!m) return null;
          return JSON.parse(m[0]);
        }
      } catch (e) { console.error("[rectifier] failed", e); return null; }
    }
  };
}
