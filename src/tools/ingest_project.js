import { ingestProject } from "../controllers/projectManager/ingest.js";

/**
 * @param {{projectRoot?:string, scanned?:any[]}} args
 * @param {{projectRoot?:string}} context
 */
export default {
  name: "ingest_project",
  description: "Ingest project files into vector store (support pre-scanned payload)",
  schema: {
    type: "object",
    properties: {
      projectRoot: { type: "string" },
      scanned: { type: "array" }
    },
    required: ["projectRoot"]
  },
  handler: ingestProject
};
