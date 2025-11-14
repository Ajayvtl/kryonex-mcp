import { scanProject } from "../controllers/projectManager/scanProject.js";

/**
 * @param {{projectRoot?:string}} args
 * @param {{projectRoot?:string}} context
 */
export default {
  name: "scan_project",
  description: "Scan project and return metadata & content",
  schema: {
    type: "object",
    properties: { projectRoot: { type: "string" } },
    required: ["projectRoot"]
  },
  handler: scanProject
};
