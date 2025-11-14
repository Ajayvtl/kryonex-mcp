import { z } from "zod";
import { exec } from "child_process"; // Use async exec
import fs from "fs/promises"; // Use fs/promises for async operations
import fssync from "fs"; // For existsSync
import os from "os";
import path from "path";
import { detectSystem } from "../utils/initProject.mjs"; // Import detectSystem
import { loadToolsConfig } from "../models/kryonexStorage.js"; // Import loadToolsConfig
import { isModelDownloaded } from "./modelManagerTool.js"; // Import isModelDownloaded

async function safeExec(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { stdio: "pipe" }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: error.message, stderr: stderr.trim() });
      } else {
        resolve({ success: true, output: stdout.trim() });
      }
    });
  });
}

export default {
  name: "system_health",
  description: "Check system readiness for Kryonex MCP",

  schema: z.object({}),

  handler: async (_, context) => {
    const root = context.projectRoot;
    const logs = [];

    const logCheck = (name, status, details = "") => {
      logs.push({ name, status, details });
      if (status === "FAIL") {
        console.error(`❌ ${name}: ${details}`);
      } else if (status === "WARN") {
        console.warn(`⚠️ ${name}: ${details}`);
      } else {
        console.log(`✅ ${name}: ${details}`);
      }
    };

    // 1. Validate system environment details (platform, arch, shell, Node, Python)
    const detectedSystemInfo = detectSystem(); // Use detectSystem from initProject.mjs
    logCheck("Platform", "PASS", `${detectedSystemInfo.platform} (${detectedSystemInfo.arch})`);
    logCheck("Shell", "PASS", detectedSystemInfo.shell);

    const expectedNodeVersion = "v20"; // Example: Expect Node.js v20 or higher
    if (detectedSystemInfo.node && detectedSystemInfo.node.startsWith(expectedNodeVersion)) {
      logCheck("Node.js Version", "PASS", detectedSystemInfo.node);
    } else {
      logCheck("Node.js Version", "WARN", `Expected ${expectedNodeVersion}, got ${detectedSystemInfo.node || "N/A"}`);
    }

    const expectedPythonVersion = "Python 3.12"; // Example: Expect Python 3.12 or higher
    if (detectedSystemInfo.python && detectedSystemInfo.python.startsWith(expectedPythonVersion)) {
      logCheck("Python Version", "PASS", detectedSystemInfo.python);
    } else {
      logCheck("Python Version", "WARN", `Expected ${expectedPythonVersion}, got ${detectedSystemInfo.python || "N/A"}`);
    }

    // 2. Detect missing dependencies (git, ssh, vercel)
    const gitCheck = await safeExec("git --version");
    logCheck("Git Installed", gitCheck.success ? "PASS" : "FAIL", gitCheck.success ? gitCheck.output : gitCheck.error);

    const sshCheck = await safeExec("ssh -V");
    logCheck("SSH Installed", sshCheck.success ? "PASS" : "FAIL", sshCheck.success ? sshCheck.output.split('\n')[0] : sshCheck.error); // SSH -V outputs multiple lines

    const vercelCheck = await safeExec("vercel --version");
    logCheck("Vercel CLI Installed", vercelCheck.success ? "PASS" : "FAIL", vercelCheck.success ? vercelCheck.output : vercelCheck.error);

    // 3. Validate .kryonex/tools-config.json exists and is readable
    const toolsConfigPath = path.join(root, ".kryonex/tools-config.json");
    let toolsConfig = null;
    try {
      toolsConfig = await loadToolsConfig(root);
      logCheck(".kryonex/tools-config.json", "PASS", "Exists and readable");
    } catch (e) {
      logCheck(".kryonex/tools-config.json", "FAIL", `Missing or unreadable: ${e.message}`);
    }

    // 4. Detect missing models
    if (toolsConfig) {
      const textModel = toolsConfig.activeModelText;
      const codeModel = toolsConfig.activeModelCode;

      const textModelDownloaded = await isModelDownloaded(textModel, root);
      logCheck(`Text Model (${textModel})`, textModelDownloaded ? "PASS" : "FAIL", textModelDownloaded ? "Downloaded" : "Missing");

      const codeModelDownloaded = await isModelDownloaded(codeModel, root);
      logCheck(`Code Model (${codeModel})`, codeModelDownloaded ? "PASS" : "FAIL", codeModelDownloaded ? "Downloaded" : "Missing");
    } else {
      logCheck("Model Status", "WARN", "Cannot check models, tools-config.json is missing or invalid.");
    }

    // 5. Confirm active project exists (placeholder for now, as projectSelectorTool will manage this)
    const activeProjectStatus = context.activeProject ? "PASS" : "WARN";
    const activeProjectDetails = context.activeProject ? `Active project: ${context.activeProject}` : "No active project selected.";
    logCheck("Active Project", activeProjectStatus, activeProjectDetails);

    return { success: true, checks: logs };
  }
};
