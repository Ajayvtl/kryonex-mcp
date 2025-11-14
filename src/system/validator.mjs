// src/system/validator.mjs
// Simple validator: static rule checks + optional LLM justification
export default function createValidator({ ollamaTool }) {
  return {
    async validateToolCall({ toolName, args, context }) {
      // example static checks
      if (toolName === "apply_patch" && (!args || !args.patch)) {
        return { accepted: false, reason: "apply_patch requires a patch field" };
      }
      // small heuristic: prevent dangerous tools without allowSideEffects flag
      if (args && args.sideEffect && !args.allowSideEffects) {
        return { accepted: false, reason: "Side-effecting tool call blocked: missing allowSideEffects=true" };
      }
      // optional LLM validation: ask the LLM to justify the call (stronger)
      if (ollamaTool) {
        const prompt = `You are a validator. Briefly state whether calling tool "${toolName}" with args ${JSON.stringify(args)} is appropriate in project context: ${JSON.stringify(context.projectRoot)}. Answer JSON {accepted: bool, reason: "..."}.`;
        try {
          const resp = await ollamaTool.handler({ prompt, mode: "validate" }, context);
          // try parse JSON
          try {
            const parsed = JSON.parse(resp.text);
            if (typeof parsed.accepted === "boolean") return parsed;
          } catch (e) {
            // fallback accept
            return { accepted: true, reason: "validator LLM returned unparsable; default accept" };
          }
        } catch (err) {
          return { accepted: true, reason: "validator LLM failed; default accept" };
        }
      }

      return { accepted: true };
    }
  };
}
