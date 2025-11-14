import { analyzeCodebase } from "../controllers/codeIntelligence/analyzeCodebase.js";

export default {
  name: "analyze_codebase",
  description: "High-level analysis of the entire codebase using RAG + framework detection.",
  schema: {
    type: "object",
    properties: {
      projectRoot: { type: "string" },
      query: { type: "string" }
    },
    required: ["projectRoot", "query"]
  },
  handler: analyzeCodebase
};
