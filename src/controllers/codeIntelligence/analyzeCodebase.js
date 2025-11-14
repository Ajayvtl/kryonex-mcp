import fileUtils from "../../utils/fileUtils.js";
import projectScanner from "../../utils/projectScanner.js";
import frameworkDetection from "../../utils/frameworkDetection.js";
import ragEngine from "../../utils/ragEngine.js";

/**
 * @param {{projectRoot?: string, query: string}} args
 * @param {{projectRoot?: string}} context
 */
export async function analyzeCodebase(args, context) {
  const root = fileUtils.resolveProjectRoot(
    args.projectRoot || context?.projectRoot || process.cwd()
  );

  // Scan project (File-level metadata + content)
  const scanned = await projectScanner.scanProject(root);

  // Framework detection (React, Express, Next.js etc.)
  const frameworks = await frameworkDetection.detectFrameworks(root, scanned);

  // RAG deep context (semantic context)
  const rag = await ragEngine.ragDeepContext(root, args.query, scanned);

  // Provide sample file structure
  const sampleFiles = scanned.slice(0, 25).map(({ meta }) => ({
    path: meta.relativePath,
    size: meta.size,
  }));

  return {
    projectRoot: root,
    query: args.query,
    frameworksDetected: frameworks,
    sampleFiles,
    ragContext: rag.context,
    results: rag.results,
  };
}
