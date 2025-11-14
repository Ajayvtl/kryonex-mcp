import { removeFile } from "../controllers/projectManager/removeFile.js";

/**
 * @param {{projectRoot?:string, relativePath:string}} args
 * @param {{projectRoot?:string}} context
 */
export default {
  name: "remove_file_from_store",
  description: "Remove a file and its chunks from the vector store",
  schema: {
    type: "object",
    properties: {
      projectRoot: { type: "string" },
      relativePath: { type: "string" }
    },
    required: ["projectRoot", "relativePath"]
  },
  handler: removeFile
};
