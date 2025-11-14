import { explainCode } from "../controllers/codeIntelligence/explain.js";

export default {
  name: "explain_code",
  description: "Explain inline code using language detection + RAG context.",
  schema: {
    type: "object",
    properties: {
      projectRoot: { type: "string" },
      code: { type: "string" }
    },
    required: ["projectRoot", "code"]
  },
  handler: explainCode
};
