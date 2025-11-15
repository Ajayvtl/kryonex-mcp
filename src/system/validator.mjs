export default function createValidator({ ollamaTool = null } = {}) {
  return {
    async validateToolCall({ toolName, args, context } = {}) {
      if (!toolName) return { accepted: false, reason: "missing toolName" };
      if (args && args.sideEffect === true && args.allowSideEffects !== true) return { accepted: false, reason: "sideEffect blocked" };
      if (toolName === "apply_patch" && (!args || !args.patch)) return { accepted: false, reason: "apply_patch requires patch" };

      if (ollamaTool && typeof ollamaTool.handler === "function") {
        try {
          const prompt = `Validator: is calling ${toolName} with args ${JSON.stringify(args)} appropriate? Return JSON {"accepted": true/false, "reason":"..."} `;
          const resp = await ollamaTool.handler({ prompt, mode: "validate" }, context);
          if (resp && resp.text) {
            try { const parsed = JSON.parse(resp.text); if (typeof parsed.accepted === "boolean") return parsed; } catch (e) {}
          }
        } catch (e) {
          console.error("[validator] LLM check failed", e);
        }
      }

      return { accepted: true };
    }
  };
}
