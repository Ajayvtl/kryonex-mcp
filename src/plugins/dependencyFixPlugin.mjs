// dependencyFixTool.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const REQUIRED_PKGS = ["ollama", "sqlite3", "better-sqlite3"];

// ✅ Define schema FIRST
export const schema = {
    type: "object",
    properties: {
        force: {
            type: "boolean",
            description: "Force reinstall if existing modules are corrupt.",
            default: false
        },
        workspaceRoot: {
            type: "string",
            description: "Workspace root where dependencies should be installed."
        }
    }
};

// ✅ Define handler SECOND
export async function handler({ force = false, workspaceRoot }, context) {
    const cwd = workspaceRoot ?? context?.workspaceFolder ?? process.cwd();
    const nodeModulesPath = path.join(cwd, "node_modules");

    if (!fs.existsSync(nodeModulesPath)) {
        fs.mkdirSync(nodeModulesPath);
    }

    let fixed = [];

    for (const pkg of REQUIRED_PKGS) {
        const exists = fs.existsSync(path.join(nodeModulesPath, pkg));
        if (!exists || force) {
            try {
                execSync(`npm install ${pkg}`, { cwd, stdio: "ignore" });
                fixed.push(pkg);
            } catch (err) {
                return {
                    success: false,
                    error: `Failed installing ${pkg}: ${err.message}`
                };
            }
        }
    }

    if (context?.memoryService) {
        await context.memoryService.storeFeedback(
            "mcp-auto-fix",
            `Dependencies fixed: ${fixed.join(", ")}`
        );
    }

    return {
        success: true,
        fixed,
        cwd,
        message: fixed.length > 0
            ? `✅ Fixed missing deps: ${fixed.join(", ")}`
            : `✅ Environment already healthy`
    };
}

// ✅ Name and description must be exported BY NAME (MCP requires this)
export const name = "auto_fix_dependencies";
export const description = "Fixes missing dependencies (sqlite3, ollama, etc.), ensures node_modules exists.";

// ✅ MCP tool default export
const tool = { name, description, schema, handler };
export default tool;
