import { createRequire } from "module";
const require = createRequire(import.meta.url);
const fssync = require('fs'); // Synchronous file system operations
const fs = require('fs').promises; // Asynchronous file system operations
const path = require('path');
const minimatch = require("minimatch");
import { resolveWorkspacePath } from "../utils/pathResolver.js";
import projectScanner from "../utils/projectScanner.js"; // Added import
import semanticStore from "../utils/semanticStore.js"; // Added import

const CANDIDATE_NAMES = ["server", "backend", "api", "src", "ui", "frontend", "app"];

async function findProjectFoldersDeep(base, depth = 1, maxDepth = 3) {
    if (depth > maxDepth) return [];
    let found = [];
    for (const entry of fssync.readdirSync(base, { withFileTypes: true })) { // Use fssync
        if (entry.isDirectory()) {
            const full = path.join(base, entry.name);
            if (CANDIDATE_NAMES.includes(entry.name.toLowerCase())) found.push(full);
            found = found.concat(await findProjectFoldersDeep(full, depth + 1, maxDepth));
        }
    }
    return found;
}

const dependencyGraphTool = {
    name: 'generate_dependency_graph',
    description: 'Generates a dependency graph for a project by scanning import/require statements.',
    schema: {
        type: 'object',
        properties: {
            startPath: {
                type: 'string',
                description: 'The starting directory to scan for files.',
                default: "__workspace_root__"
            },
            filePatterns: {
                type: 'array',
                items: {
                    type: 'string'
                },
                description: 'An array of glob patterns to filter files (e.g., ["**/*.js", "**/*.ts"]).',
                default: ['**/*.js', '**/*.ts', '**/*.py'] // Default patterns for common languages
            }
        },
        required: []
    },
    handler: async (args, context) => {
        const { memoryService, db } = context; // Extract memoryService and db from context
        const workspaceFolder = context?.workspaceFolder || process.cwd();
        let { startPath: initialStartPath, filePatterns = ["**/*.js", "**/*.ts", "**/*.py"] } = args;
        const debugLogs = [];

        const logDebug = (message, ...d) => {
            debugLogs.push({ message, data: d });
            // console.error(message, ...data); // Keep console.error for local debugging if needed
        };

        let currentWorkspaceRoot = context?.workspaceFolder || process.cwd();
        let scanPath = initialStartPath;

        // If startPath is not explicitly provided or is a placeholder, attempt auto-detection
        if (!startPath || scanPath === undefined || scanPath === "__workspace_root__" || scanPath === '.' || scanPath === null) {
            scanPath = pathResolver.resolve(currentWorkspaceRoot); // Use pathResolver
            logDebug("🌍 Initial scan path (from args or default):", scanPath);
            logDebug("🌍 Current workspace root:", currentWorkspaceRoot);

            /** 🔍 Attempt automatic multi-folder detection */
            let detectedFolders = await findProjectFoldersDeep(currentWorkspaceRoot);
            logDebug("🔍 Detected candidate folders (raw):", detectedFolders);

            detectedFolders = [...new Set(detectedFolders)]; // remove duplicates
            logDebug("🔍 Detected candidate folders (unique):", detectedFolders);

            if (detectedFolders.length > 1) {
                return {
                    askUser: true,
                    success: false,
                    message: `Multiple project folders detected`,
                    options: detectedFolders.map(folder => ({
                        label: "Scan → " + path.relative(currentWorkspaceRoot, folder),
                        value: folder
                    })),
                    debugLogs // Include debug logs in the response
                };
            } else if (detectedFolders.length === 1) {
                scanPath = detectedFolders[0];
                logDebug("🟢 Auto-selected single project folder:", scanPath);
            } else {
                logDebug("⚠️ No specific project folders detected, defaulting to workspace root for scan.");
                scanPath = resolveWorkspacePath(context, currentWorkspaceRoot);
            }
        } else {
            // If a specific startPath was provided, use it directly
            scanPath = resolveWorkspacePath(context, scanPath);
            logDebug("📁 Explicit startPath provided, scanning:", scanPath);
        }

        /** ✅ STORE PROJECT MEMORY */
        await memoryService.storeFeedback(
            "project-root",
            `Detected project root: ${scanPath}`
        );

        logDebug("📁 Scanning Project Root:", scanPath);

        // Language detection (simplified for demonstration)
        const ext = (await fs.readdir(scanPath)).some(f => f.endsWith(".py"))
            ? "python"
            : "js/ts"; // This 'ext' variable is currently unused, but kept for future potential use.

        const graph = {
            nodes: [], // { id: 'file_path', label: 'file_name', type: 'file' }
            edges: []  // { source: 'importer_file_path', target: 'imported_file_path', type: 'imports' }
        };
        const visitedFiles = new Set();
        const fileContents = new Map(); // Cache file contents

        const extractDependencies = (filePath, content) => {
            const dependencies = new Set();
            const fileExtension = path.extname(filePath).toLowerCase();

            if (fileExtension === '.js' || fileExtension === '.ts') {
                // JavaScript/TypeScript imports (ESM and CommonJS)
                const jsRegex = /(?:import(?:["'\s]*(?:[\w*{}\n\r\t, ]+)from\s*)?["'`](.*?)["'`])|(?:require\s*\(\s*["'`](.*?)["'`]\s*\))/g;
                let match;
                while ((match = jsRegex.exec(content)) !== null) {
                    const depPath = match[1] || match[2];
                    if (depPath && !depPath.startsWith('.') && !path.isAbsolute(depPath)) {
                        // External dependency, ignore for internal graph
                        continue;
                    }
                    dependencies.add(depPath);
                }
            } else if (fileExtension === '.py') {
                // Python imports
                const pyRegex = /(?:from\s+([\w.]+)\s+import\s+[\w, *]+)|(?:import\s+([\w.]+))/g;
                let match;
                while ((match = pyRegex.exec(content)) !== null) {
                    const depPath = match[1] || match[2];
                    if (depPath) {
                        dependencies.add(depPath.replace(/\./g, path.sep)); // Convert dot notation to path
                    }
                }
            }
            // Add more language-specific parsers here if needed

            return Array.from(dependencies);
        };

        const resolveModulePath = (importerPath, modulePath) => {
            if (!modulePath) return null;

            // Handle absolute paths
            if (path.isAbsolute(modulePath)) {
                return fileContents.has(modulePath) ? modulePath : null;
            }

            // Handle relative paths
            if (modulePath.startsWith('.')) {
                const resolvedBase = path.resolve(path.dirname(importerPath), modulePath);
                const possibleExtensions = ['.js', '.ts', '.py', '.json', '']; // '' for directory imports (index.js/py)
                for (const ext of possibleExtensions) {
                    const candidatePath = resolvedBase + ext;
                    if (fileContents.has(candidatePath)) {
                        return candidatePath;
                    }
                    const indexCandidatePath = path.join(resolvedBase, `index${ext}`);
                    if (fileContents.has(indexCandidatePath)) {
                        return indexCandidatePath;
                    }
                    const initCandidatePath = path.join(resolvedBase, `__init__${ext}`); // For Python packages
                    if (fileContents.has(initCandidatePath)) {
                        return initCandidatePath;
                    }
                }
                return null; // Could not resolve relative path
            }

            // Handle non-relative, non-absolute paths (assume internal project modules for now)
            // This is a simplification. A full resolver would check node_modules, PYTHONPATH etc.
            const possibleProjectPaths = [
                path.join(scanPath, modulePath),
                path.join(scanPath, modulePath + '.js'),
                path.join(scanPath, modulePath + '.ts'),
                path.join(scanPath, modulePath + '.py'),
                path.join(scanPath, modulePath, 'index.js'),
                path.join(scanPath, modulePath, 'index.ts'),
                path.join(scanPath, modulePath, '__init__.py'),
            ];
            for (const p of possibleProjectPaths) {
                if (fileContents.has(p)) {
                    return p;
                }
            }
            return null; // Cannot resolve
        };

        const processFile = async (filePath) => {
            if (visitedFiles.has(filePath)) {
                return;
            }
            visitedFiles.add(filePath);

            const relativeFilePath = path.relative(scanPath, filePath);
            graph.nodes.push({ id: relativeFilePath, label: path.basename(filePath), type: 'file' });

            let content;
            try {
                content = await fs.readFile(filePath, 'utf8');
                fileContents.set(filePath, content); // Cache content
            } catch (readError) {
                logDebug(`Could not read file ${filePath}: ${readError.message}`);
                return;
            }

            const dependencies = extractDependencies(filePath, content);

            for (const dep of dependencies) {
                const resolvedDepPath = resolveModulePath(filePath, dep);
                if (resolvedDepPath && fileContents.has(resolvedDepPath)) { // Only add edges for internal, resolved files
                    const relativeResolvedDepPath = path.relative(scanPath, resolvedDepPath);
                    graph.edges.push({ source: relativeFilePath, target: relativeResolvedDepPath, type: 'imports' });
                    await processFile(resolvedDepPath); // Recursively process dependency
                }
            }
        };

        const allFiles = await projectScanner.scanProject(scanPath, filePatterns);
        logDebug(`📄 Files detected by projectScanner: ${allFiles.length}`);
        // Pre-read all file contents to populate cache for resolver
        for (const file of allFiles) {
            try {
                const content = await fs.readFile(file.fullPath, 'utf8'); // Use file.fullPath
                fileContents.set(file.fullPath, content);
            } catch (readError) {
                logDebug(`Could not pre-read file ${file.fullPath}: ${readError.message}`);
            }
        }

        for (const file of allFiles) {
            await processFile(file.fullPath); // Use file.fullPath
        }
        logDebug(`📄 Files detected: ${allFiles.length}`);

        // Save dependency graph to .kryonex/dependency-graph.json using semanticStore
        if (db) {
            // Store nodes and edges in the database
            for (const node of graph.nodes) {
                await db.upsertFile(node.id, "", "unknown", Date.now()); // Simplified, hash and lang can be improved
            }
            // This part needs more sophisticated handling to store graph edges in the DB
            // For now, we'll just store a summary or the graph itself as a semantic entry
            await semanticStore.addSemanticEntry(
                context.projectRoot,
                "dependencies",
                "dependency-graph",
                JSON.stringify(graph),
                db
            );
        } else {
            logDebug("⚠️ Database not available, skipping dependency graph storage in DB.");
        }

        return {
            success: true,
            message: `Dependency graph generated and saved successfully ✅`,
            // location: `Saved at ${fullPath}` // fullPath is not defined here
        };
    }
};
export const name = dependencyGraphTool.name;
export const description = dependencyGraphTool.description;
export const schema = dependencyGraphTool.schema;
export const handler = dependencyGraphTool.handler;
export default dependencyGraphTool;
