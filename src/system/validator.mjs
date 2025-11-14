// src/system/validator.mjs
/**
 * Simple validator factory.
 * Accepts an LLM tool object optionally to perform contextual validation.
 *
 * validateToolCall({ toolName, args, context }) -> { accepted: bool, reason?: string }
 */

export default function createValidator({ ollamaTool = null } = {}) {
  return {
    async validateToolCall({ toolName, args, context } = {}) {
      // Static rule checks
      if (!toolName) return { accepted: false, reason: "Missing toolName" };

      // Basic safety rule: if a tool is marked sideEffect=true in args, require allowSideEffects flag
      if (args && args.sideEffect === true && args.allowSideEffects !== true) {
        return { accepted: false, reason: "Side-effecting tool call blocked: set allowSideEffects=true" };
      }

      // If tool is "apply_patch" ensure patch exists
      if (toolName === "apply_patch" && (!args || !args.patch)) {
        return { accepted: false, reason: "apply_patch requires patch field" };
      }

      // Optionally ask LLM for a short validation (useful to catch hallucinated plans)
      if (ollamaTool && typeof ollamaTool.handler === "function") {
        try {
          const prompt = `
You are a short validator. Given a tool call:
toolName: ${toolName}
args: ${JSON.stringify(args)}
projectRoot: ${context?.projectRoot || "unknown"}

Reply with a compact JSON object: {"accepted": true/false, "reason":"..."}
`;
          const resp = await ollamaTool.handler({ prompt, mode: "validate" }, context);
          if (resp && resp.text) {
            try {
              const parsed = JSON.parse(resp.text);
              if (typeof parsed.accepted === "boolean") return parsed;
            } catch (e) {
              // ignore parse error and accept
            }
          }
        } catch (e) {
          // LLM failed - fallback to accept (but log)
          console.error("[Validator] LLM validation failed:", e);
        }
      }

      return { accepted: true };
    },
  };
}
