import { addMemory } from "../controllers/semanticMemory/add.js";

export default {
  name: "semantic_memory_add",
  description: "Add an item to semantic memory",
  schema: {
    type: "object",
    properties: {
      projectRoot: { type: "string" },
      text: { type: "string" },
      tags: { type: "array", items: { type: "string" } }
    },
    required: ["projectRoot", "text"]
  },
  handler: addMemory
};
