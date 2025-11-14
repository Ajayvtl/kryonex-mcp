import { analyzeCodeFile } from "../controllers/codeIntelligence/analyzeFile.js";

export default {
  name: "analyze_code_file",
  description: "Analyze a code file and return language + context",
  schema: {
    type: "object",
    properties: { projectRoot: { type: "string" }, relativePath: { type: "string" } },
    required: ["projectRoot","relativePath"]
  },
  handler: analyzeCodeFile
};
