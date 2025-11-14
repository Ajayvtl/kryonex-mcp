import projectScanner from "../../utils/projectScanner.js";
import fileUtils from "../../utils/fileUtils.js";

/**
 * @param {{projectRoot?:string}} args
 * @param {{projectRoot?:string}} context
 */
export async function scanProject(args, context) {
  const root = fileUtils.resolveProjectRoot(args.projectRoot || context?.projectRoot || process.cwd());
  const scanned = await projectScanner.scanProject(root);
  return { projectRoot: root, scannedCount: scanned.length, scanned };
}
