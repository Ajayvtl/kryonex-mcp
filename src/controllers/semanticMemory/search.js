import fileUtils from "../../utils/fileUtils.js";
import semanticStore from "../../utils/semanticStore.js";
import { getProjectStorePaths, loadKryonexGeneralConfig } from "../../models/kryonexStorage.js";
import fs from "fs/promises";

/**
 * @param {{projectRoot?:string, query:string, topK?:number, tags?:string[]}} args
 * @param {{projectRoot?:string}} context
 */
export async function searchMemory(args, context) {
  const root = fileUtils.resolveProjectRoot(args.projectRoot || context?.projectRoot || process.cwd());
  const config = await loadKryonexGeneralConfig(root);
  const { memoryStorePath } = await getProjectStorePaths(root);

  const raw = await fs.readFile(memoryStorePath, "utf8").catch(() => "{}");
  const store = JSON.parse(raw || "{}");
  const qEmbedding = await semanticStore.embedContent(config.embeddingModelText, args.query, config.useLocalXenova);

  function cosineSim(a, b) {
    if (!a || !b) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
  }

  const results = [];
  for (const m of Object.values(store)) {
    if (Array.isArray(args.tags) && args.tags.length > 0) {
      if (!args.tags.some(t => m.tags?.includes(t))) continue;
    }
    const score = cosineSim(qEmbedding, m.embedding);
    results.push({ id: m.id, text: m.text, tags: m.tags, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, args.topK || 5);
}
