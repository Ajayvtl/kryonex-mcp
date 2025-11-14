// File: utils/initProject.mjs
import os from "os";
import { execSync } from "child_process";
import fs from "fs";
import inquirer from "inquirer";
import { loadKryonexGeneralConfig, saveKryonexGeneralConfig } from "../models/kryonexStorage.js";

function safeExec(cmd) {
  try { return execSync(cmd, { stdio:"pipe" }).toString().trim(); }
  catch(e){ return null; }
}

export function detectSystem() {
  return {
    platform: process.platform,
    arch: process.arch,
    shell: process.env.SHELL || process.env.ComSpec || null,
    node: safeExec("node -v"),
    npm: safeExec("npm -v"),
    python: safeExec("python --version") || safeExec("python3 --version")
  };
}

export async function runInitProject({ workspacePath="." } = {}) {
  console.log("Detecting system...");
  const sys = detectSystem();
  console.log(sys);

  // Temporarily hardcode answers for testing non-interactive execution
  const answers = {
    projectName: "ProjectA",
    chooseShell: sys.shell || "bash",
    allowWindows: true
  };

  // The config will be managed by kryonexStorage.js
  // No need to create .kryonex/tools-config.json directly here.

  let kryonexConfig = await loadKryonexGeneralConfig(workspacePath);

  kryonexConfig.projects[answers.projectName] = {
    shell: answers.chooseShell,
    allowWindows: answers.allowWindows,
    ftp: { host:null, user:null, remotePath:null },
    ssh: { host:null, user:null, privateKey:null, lastDeployed:null },
    vercel: { projectId:null, lastDeployed:null }
  };

  await saveKryonexGeneralConfig(workspacePath, kryonexConfig);
  console.log("Updated Kryonex config with project:", answers.projectName);
  return kryonexConfig;
}

export default runInitProject;
