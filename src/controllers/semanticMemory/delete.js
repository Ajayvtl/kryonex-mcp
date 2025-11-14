import fileUtils from "../../utils/fileUtils.js";
import { getProjectStorePaths } from "../../models/kryonexStorage.js";
import fs from "fs/promises";

/**
 * @param {{projectRoot?:string, id:string}} args
 * @param {{projectRoot?:string}} context
 */
export async function deleteMemory(args, context) {
  if (!args.id) throw new Error("id required");
  const root = fileUtils.resolveProjectRoot(args.projectRoot || context?.projectRoot || process.cwd());
  const { memoryStorePath } = await getProjectStorePaths(root);

  try {
    const raw = await fs.readFile(memoryStorePath, "utf8");
    const store = JSON.parse(raw || "{}");
    if (!store[args.id]) return { removed: false, reason: "not found" };
    delete store[args.id];
    await fs.writeFile(memoryStorePath, JSON.stringify(store, null, 2));
    return { removed: true, id: args.id };
  } catch (err) {
    return { removed: false, reason: err.message };
  }
}
