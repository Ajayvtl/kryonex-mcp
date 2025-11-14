import { listMemory } from "../controllers/semanticMemory/list.js";

export default {
  name: "semantic_memory_list",
  description: "List semantic memory entries",
  schema: {
    type: "object",
    properties: { projectRoot: { type: "string" } },
    required: ["projectRoot"]
  },
  handler: listMemory
};
