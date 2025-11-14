import { searchMemory } from "../controllers/semanticMemory/search.js";

export default {
  name: "semantic_memory_search",
  description: "Search semantic memory by query and tags",
  schema: {
    type: "object",
    properties: {
      projectRoot: { type: "string" },
      query: { type: "string" },
      topK: { type: "number" },
      tags: { type: "array", items: { type: "string" } }
    },
    required: ["projectRoot", "query"]
  },
  handler: searchMemory
};
