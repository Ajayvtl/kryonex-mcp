import languageDetection from "../../utils/languageDetection.js";
import ragEngine from "../../utils/ragEngine.js";
import fileUtils from "../../utils/fileUtils.js";

/**
 * @param {{projectRoot?: string, code: string}} args
 * @param {{projectRoot?: string}} context
 */
export async function explainCode(args, context) {
  const root = fileUtils.resolveProjectRoot(
    args.projectRoot || context?.projectRoot || process.cwd()
  );

  const lang = languageDetection.detectLanguage(args.code || "", "inline");

  // Use the inline code as the query context
  const rag = await ragEngine.ragQuery(
    root,
    `Explain this ${lang} code snippet: \n\n${args.code}`
  );

  return {
    language: lang,
    ragContext: rag.context,
    results: rag.results
  };
}
