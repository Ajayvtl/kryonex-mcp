// src/system/rectifier.mjs
/**
 * Rectifier factory - asks an LLM to propose corrected args or alternative plan.
 * rectify({ toolName, args, context, reason }) -> { args: {...} } or null
 */

export default function createRectifier({ ollamaTool = null } = {}) {
  return {
    async rectify({ toolName, args, context, reason } = {}) {
      if (!ollamaTool || typeof ollamaTool.handler !== "function") return null;
      try {
        const prompt = `
Tool call rejected by validator.
toolName: ${toolName}
reason: ${reason}
args: ${JSON.stringify(args)}
projectRoot: ${context?.projectRoot || "unknown"}

Please propose corrected args JSON or return {"rejected": true} if no safe correction exists.
Return only valid JSON.
`;
        const resp = await ollamaTool.handler({ prompt, mode: "rectify" }, context);
        if (!resp || !resp.text) return null;
        try {
          const parsed = JSON.parse(resp.text);
          if (parsed && typeof parsed === "object") return parsed;
        } catch (e) {
          // Not JSON - attempt to extract JSON substring
          const m = resp.text.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              const parsed = JSON.parse(m[0]);
              return parsed;
            } catch (err) {
              return null;
            }
          }
          return null;
        }
      } catch (e) {
        console.error("[Rectifier] LLM rectify failed:", e);
        return null;
      }
    },
  };
}
