import { env, AutoModel, AutoTokenizer } from "@xenova/transformers";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GLOBAL CACHE FOR ALL PROJECTS
env.cacheDir = path.join(__dirname, "../../models");
env.allowRemoteModels = true;

export async function loadTextEmbeddingModel() {
  return {
    tokenizer: await AutoTokenizer.from_pretrained("Xenova/all-MiniLM-L6-v2"),
    model: await AutoModel.from_pretrained("Xenova/all-MiniLM-L6-v2"),
  };
}

export async function loadCodeEmbeddingModel() {
  return {
    tokenizer: await AutoTokenizer.from_pretrained("Xenova/codebert-base"),
    model: await AutoModel.from_pretrained("Xenova/codebert-base"),
  };
}
