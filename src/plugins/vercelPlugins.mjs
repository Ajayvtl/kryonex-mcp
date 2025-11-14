// File: plugins/vercelPlugins.mjs
import inquirer from "inquirer";
import { exec as _exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
const exec = promisify(_exec);

async function runCmd(cmd, opts={}) {
  return exec(cmd, { maxBuffer: 1024*1024*20, ...opts });
}

export async function runVercelTool({ projectPath="." } = {}) {
  const answers = await inquirer.prompt([
    { name:"path", message:"Project path for deploy", default: projectPath },
    { name:"prod", type:"confirm", message:"Deploy to production?" , default:true },
    { name:"confirm", type:"confirm", message:"Proceed with deploy (will tag current commit)?" , default:true }
  ]);
  if (!answers.confirm) return console.log("Aborted");

  // create git tag for safety
  const tag = `kryonex-deploy-${Date.now()}`;
  try {
    await runCmd(`git -C "${answers.path}" tag -a ${tag} -m "kryonex deploy snapshot"`);
    console.log(`Created tag ${tag}`);
  } catch(e){ console.warn("Tag failed:", e.stderr || e.message); }

  try {
    const cmd = `npx vercel --cwd "${answers.path}" ${answers.prod ? "--prod --confirm" : ""}`;
    console.log("Running:", cmd);
    const { stdout, stderr } = await runCmd(cmd);
    console.log(stdout);
    if (stderr) console.error(stderr);

    // log
    const logPath = `${answers.path}/.kryonex`;
    if (!fs.existsSync(logPath)) fs.mkdirSync(logPath);
    const logFile = `${logPath}/vercelTool-log.json`;
    const entry = { time: new Date().toISOString(), tag, prod: answers.prod };
    let arr = [];
    if (fs.existsSync(logFile)) arr = JSON.parse(fs.readFileSync(logFile,'utf8'));
    arr.push(entry);
    fs.writeFileSync(logFile, JSON.stringify(arr,null,2));
    console.log("Deploy logged. To revert: git -C <path> reset --hard <tag> && rerun vercel deploy from that tag");
  } catch (e) {
    console.error("vercelTool error:", e.stderr || e.message || e);
  }
}

export default runVercelTool;
