import semanticStore from "../../utils/semanticStore.js";
import fileUtils from "../../utils/fileUtils.js";

/**
 * @param {{projectRoot?:string, relativePath:string}} args
 * @param {{projectRoot?:string}} context
 */
export async function removeFile(args, context) {
  const root = fileUtils.resolveProjectRoot(args.projectRoot || context?.projectRoot || process.cwd());
  if (!args.relativePath) {
    throw new Error("relativePath required");
  }
  await semanticStore.removeFileFromStore(root, args.relativePath);
  return { removed: args.relativePath };
}
