// File: lugins/gitPlugins.mjs
import { exec as _exec } from "child_process";
import { promisify } from "util";
import inquirer from "inquirer";
import fs from "fs";
const exec = promisify(_exec);

function safeExec(cmd, opts={}) {
  return exec(cmd, { maxBuffer: 1024 * 1024 * 10, ...opts });
}

async function tagCurrent(repoPath) {
  const tag = `kryonex-backup-${Date.now()}`;
  await safeExec(`git -C "${repoPath}" tag -a ${tag} -m "backup before tool action"`);
  return tag;
}

export async function runGitTool({ repoPath = ".", action = null } = {}) {
  // action: 'status'|'pull'|'push'|'checkout'|'revert'
  const answers = await inquirer.prompt([
    { name: "confirmRepo", type: "input", message: "Repo path:", default: repoPath },
    { name: "action", type: "list", message: "Git action", choices:["status","pull","push","checkout","revert"], default: action || "status" }
  ]);
  repoPath = answers.confirmRepo;
  const act = answers.action;

  try {
    if (act === "status") {
      const { stdout } = await safeExec(`git -C "${repoPath}" status --porcelain=1 -b`);
      console.log(stdout || "Clean / no output");
      return;
    }

    // create safety tag
    const backupTag = await tagCurrent(repoPath);
    console.log(`Created safety tag: ${backupTag}`);

    if (act === "pull") {
      const confirm = await inquirer.prompt([{ name: "ok", type: "confirm", message: `Run git pull in ${repoPath}?` }]);
      if (!confirm.ok) return console.log("Aborted");
      console.log("Running git pull...");
      await safeExec(`git -C "${repoPath}" pull`);
      console.log("pulled");
    } else if (act === "push") {
      const branchQ = await inquirer.prompt([{ name:"branch", type:"input", message:"Branch to push:", default:"main" }]);
      const confirm = await inquirer.prompt([{ name:"ok", type:"confirm", message:`Push ${branchQ.branch}?` }]);
      if (!confirm.ok) return console.log("Aborted");
      await safeExec(`git -C "${repoPath}" push origin ${branchQ.branch}`);
      console.log("pushed");
    } else if (act === "checkout") {
      const branchQ = await inquirer.prompt([{ name:"branch", type:"input", message:"Branch/commit to checkout:", default:"main" }]);
      const confirm = await inquirer.prompt([{ name:"ok", type:"confirm", message:`Checkout ${branchQ.branch}?` }]);
      if (!confirm.ok) return console.log("Aborted");
      await safeExec(`git -C "${repoPath}" checkout ${branchQ.branch}`);
      console.log("checked out");
    } else if (act === "revert") {
      // revert to tag
      const confirm = await inquirer.prompt([{ name:"ref", type:"input", message:"Revert to commit/tag (default: last safety tag)", default: backupTag }]);
      const ok = await inquirer.prompt([{ name:"really", type:"confirm", message:`This will reset --hard to ${confirm.ref}. Continue?` }]);
      if (!ok.really) return console.log("Aborted");
      await safeExec(`git -C "${repoPath}" reset --hard ${confirm.ref}`);
      console.log(`Repository reset to ${confirm.ref}`);
    }

    // write last action to .kryonex/tool-log.json
    const logPath = `${repoPath}/.kryonex`;
    if (!fs.existsSync(logPath)) fs.mkdirSync(logPath, { recursive:true });
    const logFile = `${logPath}/gitTool-log.json`;
    const entry = { time: new Date().toISOString(), action: act, backupTag };
    let arr = [];
    if (fs.existsSync(logFile)) arr = JSON.parse(fs.readFileSync(logFile,'utf8'));
    arr.push(entry);
    fs.writeFileSync(logFile, JSON.stringify(arr, null, 2));
    console.log("Action logged:", entry);
  } catch (err) {
    console.error("gitTool error:", err.stderr || err.message || err);
  }
}

export default runGitTool;
