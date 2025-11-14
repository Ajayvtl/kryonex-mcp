// src/agents/rectifierAgent.mjs
/**
 * Simple wrapper exposing rectifier functionality
 */
export default function createRectifierAgent({ rectifier = null } = {}) {
  return {
    name: "rectifierAgent",
    async rectifyCall({ toolName, args, context } = {}) {
      if (!rectifier || typeof rectifier.rectify !== "function") {
        throw new Error("Rectifier not configured");
      }
      return rectifier.rectify({ toolName, args, context, reason: "agent_request" });
    },
  };
}
