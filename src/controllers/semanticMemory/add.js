import fileUtils from "../../utils/fileUtils.js";
import semanticStore from "../../utils/semanticStore.js";
import { getProjectStorePaths, loadKryonexConfig } from "../../models/kryonexStorage.js";
import fs from "fs/promises";
import path from "path";

/**
 * @param {{projectRoot?:string, text:string, tags?:string[]}} args
 * @param {{projectRoot?:string}} context
 */
export async function addMemory(args, context) {
  const root = fileUtils.resolveProjectRoot(args.projectRoot || context?.projectRoot || process.cwd());
  const config = await loadKryonexConfig(root);
  const id = Date.now().toString();
  const embedding = await semanticStore.embedContent(config.embeddingModelText, args.text, config.useLocalXenova);
  const { memoryStorePath } = await getProjectStorePaths(root);

  // create memory store if not exists
  let store = {};
  try {
    const raw = await fs.readFile(memoryStorePath, "utf8");
    store = JSON.parse(raw || "{}");
  } catch (err) {
    store = {};
  }

  store[id] = { id, text: args.text, tags: args.tags || [], createdAt: Date.now(), embedding };
  await fs.mkdir(path.dirname(memoryStorePath), { recursive: true });
  await fs.writeFile(memoryStorePath, JSON.stringify(store, null, 2));

  return { id, saved: true };
}
