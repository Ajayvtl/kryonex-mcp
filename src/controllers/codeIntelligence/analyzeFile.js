import path from "path";
import fileUtils from "../../utils/fileUtils.js";
import languageDetection from "../../utils/languageDetection.js";
import ragEngine from "../../utils/ragEngine.js";

/**
 * @param {{projectRoot?:string, relativePath:string}} args
 * @param {{projectRoot?:string}} context
 */
export async function analyzeCodeFile(args, context) {
  const root = fileUtils.resolveProjectRoot(args.projectRoot || context?.projectRoot || process.cwd());
  const full = path.join(root, args.relativePath);
  const exists = await fileUtils.pathExists(full);
  if (!exists) return { exists: false, error: "not found" };
  const content = await fileUtils.readFileAuto(full);
  const text = typeof content === "string" ? content : "[binary omitted]";
  const lang = languageDetection.detectLanguage(text, full);
  const rag = await ragEngine.ragQuery(root, `Explain the file ${args.relativePath}`, { topK: 5 });
  return { exists: true, file: args.relativePath, language: lang, length: text.length, ragContext: rag.context };
}
