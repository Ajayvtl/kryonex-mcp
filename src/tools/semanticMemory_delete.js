import { deleteMemory } from "../controllers/semanticMemory/delete.js";

export default {
  name: "semantic_memory_delete",
  description: "Delete a memory entry by id",
  schema: {
    type: "object",
    properties: { projectRoot: { type: "string" }, id: { type: "string" } },
    required: ["projectRoot", "id"]
  },
  handler: deleteMemory
};
