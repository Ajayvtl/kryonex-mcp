// src/agents/rectifierAgent.mjs
export default function createRectifierAgent({ rectifier }) {
  return {
    name: "rectifier",
    async rectifyCall({ toolName, args, context }) {
      return rectifier.rectify({ toolName, args, context, reason: "agent_request" });
    }
  };
}
