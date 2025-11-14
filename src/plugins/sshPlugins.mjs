// File: plugins/sshPlugins.mjs
import { NodeSSH } from "node-ssh";
import inquirer from "inquirer";
import fs from "fs";
const ssh = new NodeSSH();

export async function runSshTool() {
  const answers = await inquirer.prompt([
    { name:"host", message:"SSH host (user@host):", type:"input" },
    { name:"auth", message:"Auth method", type:"list", choices:["privateKey","password"], default:"privateKey" },
    { name:"keyPath", message:"Private key path (if privateKey)", default:"~/.ssh/id_ed25519" },
    { name:"password", message:"Password (if chosen)", type:"password", when: a => a.auth === "password" },
    { name:"cmd", message:"Command to run on remote", default:"uname -a" }
  ]);
  // parse host
  let [user, host] = answers.host.includes("@") ? answers.host.split("@") : ["root", answers.host];

  const connectConfig = { host, username: user };
  if (answers.auth === "privateKey") connectConfig.privateKey = answers.keyPath.replace(/^~\//, `${process.env.HOME || process.env.USERPROFILE}/`);
  else connectConfig.password = answers.password;

  console.log("Connecting...");
  try {
    await ssh.connect(connectConfig);
    console.log("Connected. Running:", answers.cmd);
    const result = await ssh.execCommand(answers.cmd);
    console.log("STDOUT:\n", result.stdout);
    console.log("STDERR:\n", result.stderr);

    // log
    const logPath = ".kryonex";
    if (!fs.existsSync(logPath)) fs.mkdirSync(logPath);
    const logFile = `${logPath}/sshTool-log.json`;
    const entry = { time: new Date().toISOString(), host: answers.host, cmd: answers.cmd };
    let arr = [];
    if (fs.existsSync(logFile)) arr = JSON.parse(fs.readFileSync(logFile,'utf8'));
    arr.push(entry);
    fs.writeFileSync(logFile, JSON.stringify(arr,null,2));
  } catch (e) {
    console.error("SSH error:", e.message || e);
  } finally {
    ssh.dispose();
  }
}

export default runSshTool;
