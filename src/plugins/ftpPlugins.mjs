// File: plugins/ftpPlugins.mjs
import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import { Client } from "basic-ftp";

function isoTs() { return new Date().toISOString().replace(/[:.]/g,'-'); }

export async function runFtpTool({ localDir = "build" } = {}) {
  const answers = await inquirer.prompt([
    { name:"host", message:"FTP host", type:"input" },
    { name:"user", message:"FTP user", type:"input" },
    { name:"pass", message:"FTP password", type:"password" },
    { name:"remote", message:"Remote path (e.g. /public_html/site)", default:"/public_html/kryonex" },
    { name:"local", message:"Local path to upload", default: localDir }
  ]);

  const client = new Client();
  client.ftp.verbose = true;
  try {
    console.log("Connecting...");
    await client.access({ host: answers.host, user: answers.user, password: answers.pass });
    const backupName = `${answers.remote}-backup-${isoTs()}`;
    console.log(`Creating remote backup by renaming ${answers.remote} -> ${backupName}`);
    // attempt to rename (if exists)
    try { await client.rename(answers.remote, backupName); }
    catch(e){ console.log("Rename failed or remote dir missing:", e.message); }

    // create remote dir
    await client.ensureDir(answers.remote);
    await client.clearWorkingDir();

    // upload files recursively
    async function uploadDir(local, remote) {
      const items = fs.readdirSync(local, { withFileTypes:true });
      for (const it of items) {
        const localPath = path.join(local, it.name);
        const remotePath = `${remote}/${it.name}`;
        if (it.isDirectory()) {
          await client.ensureDir(remotePath);
          await uploadDir(localPath, remotePath);
        } else {
          console.log(`Uploading ${localPath} -> ${remotePath}`);
          await client.uploadFrom(localPath, remotePath);
        }
      }
    }

    await uploadDir(answers.local, answers.remote);
    console.log("Upload complete.");

    // log
    const logPath = ".kryonex";
    if (!fs.existsSync(logPath)) fs.mkdirSync(logPath);
    const logFile = `${logPath}/ftpTool-log.json`;
    const entry = { time: new Date().toISOString(), host:answers.host, remote:answers.remote, backupName };
    let arr = [];
    if (fs.existsSync(logFile)) arr = JSON.parse(fs.readFileSync(logFile,'utf8'));
    arr.push(entry);
    fs.writeFileSync(logFile, JSON.stringify(arr,null,2));
    console.log("Logged action");

    // prompt for revert option
    const r = await inquirer.prompt([{name:"revertNow", type:"confirm", message:"Would you like to revert (restore backup) now?"}]);
    if (r.revertNow) {
      try {
        await client.removeDir(answers.remote);
        await client.rename(backupName, answers.remote);
        console.log("Restored backup.");
      } catch(e) { console.error("Revert failed:", e); }
    }
  } catch (e) {
    console.error("FTP error:", e.message || e);
  } finally {
    client.close();
  }
}

export default runFtpTool;
