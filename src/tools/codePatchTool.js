import codePatchPlugin from "../plugins/codePatchPlugin.mjs";
import { z } from "zod";

export default {
  name: "code_patch",
  description: "Applies intelligent code patches using Kryonex semantic engine",
  schema: z.object({
    filePath: z.string(),
    patch: z.string(),
  }),

  handler: async (args, context) => {
    return await codePatchPlugin(args, context);
  }
};
