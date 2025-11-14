import projectScanner from "../../utils/projectScanner.js";
import semanticStore from "../../utils/semanticStore.js";
import fileUtils from "../../utils/fileUtils.js";

/**
 * @param {{projectRoot?:string, scanned?:any[]}} args
 * @param {{projectRoot?:string}} context
 */
export async function ingestProject(args, context) {
  const root = fileUtils.resolveProjectRoot(args.projectRoot || context?.projectRoot || process.cwd());

  // Option: caller can pass pre-scanned `scanned` (to avoid re-scan)
  const scanned = Array.isArray(args.scanned) ? args.scanned : await projectScanner.scanProject(root);

  const store = await semanticStore.ingestScannedFiles(root, scanned);
  // chunkFiles is number of file keys
  const chunkedFiles = Object.keys(store || {}).length;
  return { projectRoot: root, chunkedFiles };
}
