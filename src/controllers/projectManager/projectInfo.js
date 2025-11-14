import { loadKryonexGeneralConfig } from "../../models/kryonexStorage.js";
import fileUtils from "../../utils/fileUtils.js";

/**
 * @param {{projectRoot?:string}} args
 * @param {{projectRoot?:string}} context
 */
export async function projectInfo(args, context) {
  const root = fileUtils.resolveProjectRoot(args.projectRoot || context?.projectRoot || process.cwd());
  const cfg = await loadKryonexGeneralConfig(root);
  return { projectRoot: root, config: cfg };
}
