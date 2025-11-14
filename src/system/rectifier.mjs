// src/system/rectifier.mjs
export default function createRectifier({ ollamaTool }) {
  return {
    async rectify({ toolName, args, context, reason }) {
      if (!ollamaTool) return null;
      const prompt = `Tool call validation failed for tool "${toolName}". Reason: ${reason}. Provide a corrected args JSON or return {"rejected":true}. ProjectRoot: ${context?.projectRoot || "unknown"}.
Return only JSON like: { "args": { ... } }`;
      const resp = await ollamaTool.handler({ prompt, mode: "rectify" }, context);
      try {
        const parsed = JSON.parse(resp.text);
        if (parsed && parsed.args) return parsed;
      } catch (e) {
        return null;
      }
      return null;
    }
  };
}
