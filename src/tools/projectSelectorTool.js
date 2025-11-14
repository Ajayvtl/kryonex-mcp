import fs from "fs/promises"; // Use fs/promises for async operations
import path from "path";
import { z } from "zod";
import { scanProject } from "../utils/projectScanner.js"; // Import scanProject
import { analyzeCodebase } from "../controllers/codeIntelligence/analyzeCodebase.js"; // Assuming this is the projectAnalyzer
import { loadToolsConfig, saveToolsConfig, loadActiveModels } from "../models/kryonexStorage.js"; // Import config and model loading functions

export default {
  name: "project_selector",
  description: "Select active project in multi-project workspace",

  schema: z.object({
    action: z.enum(["list", "set"]),
    projectName: z.string().optional()
  }),

  handler: async (args, context) => {
    const projectRoot = context.projectRoot;
    let toolsConfig = await loadToolsConfig(projectRoot);

    if (args.action === "list") {
      const scannedProjects = await scanProjects(projectRoot);
      const projectsWithMetadata = [];

      for (const projectPath of scannedProjects) {
        // Assuming analyzeCodebase can take a project path and return metadata
        // This might need adjustment based on the actual implementation of analyzeCodebase
        const metadata = await analyzeCodebase(projectPath);
        projectsWithMetadata.push({
          name: path.basename(projectPath),
          path: projectPath,
          metadata: metadata, // Or a subset of metadata
        });
      }
      return { projects: projectsWithMetadata, activeProject: toolsConfig.activeProject };
    }

    if (args.action === "set") {
      if (!args.projectName) throw new Error("projectName is required");

      const scannedProjects = await scanProjects(projectRoot);
      const targetProjectPath = scannedProjects.find(p => path.basename(p) === args.projectName);

      if (!targetProjectPath) {
        throw new Error(`Project not found: ${args.projectName}`);
      }

      toolsConfig.activeProject = args.projectName;
      await saveToolsConfig(projectRoot, toolsConfig);

      // Notify storage and loader about the active project
      // This is handled by loadActiveModels which reads toolsConfig
      await loadActiveModels(projectRoot);

      // Update context for other tools
      context.activeProject = args.projectName;

      return { success: true, activeProject: args.projectName, message: `Active project set to ${args.projectName}` };
    }
  }
};
