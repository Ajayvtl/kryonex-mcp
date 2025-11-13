import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolves the workspace root from where the MCP server is executed.
 */
export function resolveWorkspacePath(context, inputPath = "") {
  // context.workspaceFolder may be undefined depending on caller
  const workspaceRoot = context?.workspaceFolder || process.cwd();

  return path.resolve(workspaceRoot, inputPath);
}

/**
 * Resolves the base path for a given project within the workspace.
 */
export function resolveProjectPath(context) {
  return context.projectRoot;
}

/**
 * Resolves a path relative to the project's .kryonex directory.
 */
export function resolveKryonexPath(context, ...subPaths) {
  const kryonexDir = path.join(context.projectRoot, ".kryonex");
  return path.join(kryonexDir, ...subPaths);
}

