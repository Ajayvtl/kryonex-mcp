import { z } from "zod";
import fs from "fs/promises"; // Use fs/promises for async operations
import fssync from "fs"; // For existsSync
import path from "path";
import { exec } from "child_process"; // Use exec for async command execution
import { loadToolsConfig, saveToolsConfig } from "../models/kryonexStorage.js"; // Import config functions

const MODELS_BASE_DIR = ".kryonex/models";

/**
 * Checks if a model is downloaded locally.
 * @param {string} modelName - The name of the model.
 * @param {string} projectRoot - The root directory of the project.
 * @returns {boolean} - True if the model is downloaded, false otherwise.
 */
export async function isModelDownloaded(modelName, projectRoot) {
  const modelDir = path.join(projectRoot, MODELS_BASE_DIR, modelName);
  return fssync.existsSync(modelDir);
}

/**
 * Downloads a model using download-model.mjs.
 * @param {string} modelName - The name of the model to download.
 * @param {string} projectRoot - The root directory of the project.
 * @returns {Promise<void>}
 */
export async function downloadModel(modelName, projectRoot) {
  const modelsDir = path.join(projectRoot, MODELS_BASE_DIR);
  if (!fssync.existsSync(modelsDir)) {
    await fs.mkdir(modelsDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const command = `node download-model.mjs ${modelName}`;
    console.log(`Executing: ${command}`);
    const child = exec(command, { cwd: projectRoot });

    child.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
    });

    child.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`Download process for ${modelName} exited with code ${code}`);
        resolve();
      } else {
        console.error(`Download process for ${modelName} exited with code ${code}`);
        reject(new Error(`Failed to download model ${modelName}. Exit code: ${code}`));
      }
    });
  });
}

export default {
  name: "model_manager",
  description: "Manage local ML models for Kryonex MCP",

  schema: z.object({
    action: z.enum(["list", "download", "delete", "switch"]),
    modelName: z.string().optional(),
    modelType: z.enum(["text", "code"]).optional(), // Added modelType for switching
  }),

  handler: async (args, context) => {
    const projectRoot = context.projectRoot;
    const modelsDir = path.join(projectRoot, MODELS_BASE_DIR);
    if (!fssync.existsSync(modelsDir)) await fs.mkdir(modelsDir, { recursive: true });

    if (args.action === "list") {
      const list = await fs.readdir(modelsDir);
      return { models: list };
    }

    if (args.action === "download") {
      if (!args.modelName) throw new Error("modelName is required");
      await downloadModel(args.modelName, projectRoot);
      return { success: true, message: `Downloaded ${args.modelName}` };
    }

    if (args.action === "delete") {
      if (!args.modelName) throw new Error("modelName is required");
      await fs.rm(path.join(modelsDir, args.modelName), { recursive: true, force: true });
      return { success: true, message: `Deleted ${args.modelName}` };
    }

    if (args.action === "switch") {
      if (!args.modelName) throw new Error("modelName is required");
      if (!args.modelType) throw new Error("modelType (text or code) is required for switching");

      const toolsConfig = await loadToolsConfig(projectRoot);

      if (args.modelType === "text") {
        toolsConfig.activeModelText = args.modelName;
      } else if (args.modelType === "code") {
        toolsConfig.activeModelCode = args.modelName;
      }

      await saveToolsConfig(projectRoot, toolsConfig);

      return { success: true, message: `Switched ${args.modelType} model to ${args.modelName}` };
    }
  }
};
