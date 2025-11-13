import fs from "fs/promises";
import path from "path";
import { resolveWorkspacePath } from "../utils/pathResolver.mjs";

const listFilesTool = {
  name: "list_files",
  description: "List files in a directory",
  schema: {
    type: "object",
    properties: {
      path: { type: "string" },
      recursive: { type: "boolean", default: false },
    },
    required: ["path"],
  },

  handler: async ({ path: relPath, recursive }, context) => {
    const target = resolveWorkspacePath(context, relPath);

    if (recursive) {
      const walk = async (dir) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        return (
          await Promise.all(
            entries.map((e) => {
              const resolved = path.join(dir, e.name);
              return e.isDirectory() ? walk(resolved) : resolved;
            })
          )
        ).flat();
      };
      const files = await walk(target);
      return { success: true, files };
    } else {
      const files = await fs.readdir(target);
      return { success: true, files };
    }
  },
};

export const name = listFilesTool.name;
export const description = listFilesTool.description;
export const schema = listFilesTool.schema;
export const handler = listFilesTool.handler;

export default listFilesTool;
