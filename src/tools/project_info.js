import { projectInfo } from "../controllers/projectManager/projectInfo.js";

/**
 * @param {{projectRoot?:string}} args
 * @param {{projectRoot?:string}} context
 */
export default {
  name: "project_info",
  description: "Return Kryonex project config and paths",
  schema: {
    type: "object",
    properties: { projectRoot: { type: "string" } },
    required: ["projectRoot"]
  },
  handler: projectInfo
};
