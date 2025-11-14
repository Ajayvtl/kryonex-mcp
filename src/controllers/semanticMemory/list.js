import fileUtils from "../../utils/fileUtils.js";
import { getProjectStorePaths } from "../../models/kryonexStorage.js";
import fs from "fs/promises";

/**
 * @param {{projectRoot?:string}} args
 * @param {{projectRoot?:string}} context
 */
export async function listMemory(args, context) {
  const root = fileUtils.resolveProjectRoot(args.projectRoot || context?.projectRoot || process.cwd());
  const { memoryStorePath } = await getProjectStorePaths(root);

  try {
    const raw = await fs.readFile(memoryStorePath, "utf8");
    const store = JSON.parse(raw || "{}");
    return store;
  } catch (err) {
    return {};
  }
}
