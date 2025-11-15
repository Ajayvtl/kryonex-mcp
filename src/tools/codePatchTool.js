import codePatchPlugin from "../plugins/codePatchPlugin.mjs";
export default {
  name: "code_patch",
  description: "Applies intelligent code patches using Kryonex semantic engine",
  schema: {
    type: "object",
    properties: {
      filePath: { type: "string" },
      patch: { type: "string" },
    },
    required: ["filePath", "patch"],
  },

  handler: async (args, context) => {
    return await codePatchPlugin(args, context);
  }
};
