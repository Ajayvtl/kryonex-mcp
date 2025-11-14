import path from "path";
import fs from "fs";
import { AutoTokenizer, AutoModel } from "@xenova/transformers";

export async function loadTextEmbeddingModel(modelName, root) {
  const modelDir = path.join(root, ".kryonex", "models", modelName);

  if (!fs.existsSync(modelDir)) {
    throw new Error(
      `Local model missing at ${modelDir}\n` +
      `Run: node src/utils/download-model.mjs ${modelName}`
    );
  }

  console.error("🔧 Loading LOCAL model:", modelDir);

  const tokenizer = await AutoTokenizer.from_pretrained(modelName, {
    local_files_only: true,
    model_path: modelDir,
  });

  const model = await AutoModel.from_pretrained(modelName, {
    local_files_only: true,
    model_path: modelDir,
  });

  return { tokenizer, model };
}

export async function loadCodeEmbeddingModel(modelName, root) {
  const modelDir = path.join(root, ".kryonex", "models", modelName);

  if (!fs.existsSync(modelDir)) {
    throw new Error(
      `Local model missing at ${modelDir}\n` +
      `Run: node src/utils/download-model.mjs ${modelName}`
    );
  }

  console.error("🔧 Loading LOCAL code model:", modelDir);

  const tokenizer = await AutoTokenizer.from_pretrained(modelName, {
    local_files_only: true,
    model_path: modelDir,
  });

  const model = await AutoModel.from_pretrained(modelName, {
    local_files_only: true,
    model_path: modelDir,
  });

  return { tokenizer, model };
}
