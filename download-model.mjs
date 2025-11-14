import { AutoTokenizer, AutoModel } from "@xenova/transformers";

// Change this to any Xenova-supported model
const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";   // <-- FIXED
console.log(`Downloading model: ${MODEL_NAME}`);

const tokenizer = await AutoTokenizer.from_pretrained(MODEL_NAME, {
  localFilesOnly: false,
});
const model = await AutoModel.from_pretrained(MODEL_NAME, {
  localFilesOnly: false,
});

console.log("✔ Model + tokenizer downloaded and cached locally.");
console.log("✔ Location:", process.env.TRANSFORMERS_CACHE || "~/.cache/transformers");
