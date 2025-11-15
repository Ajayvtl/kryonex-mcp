// copyTools.js
// Copies runtime source files into build directory so the built package contains tools, system, agents, controllers, storage, utils.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursiveSync(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const pairs = [
  { src: path.join(__dirname, "src", "tools"), dest: path.join(__dirname, "build", "tools") },
  { src: path.join(__dirname, "src", "system"), dest: path.join(__dirname, "build", "system") },
  { src: path.join(__dirname, "src", "agents"), dest: path.join(__dirname, "build", "agents") },
  { src: path.join(__dirname, "src", "controllers"), dest: path.join(__dirname, "build", "controllers") },
  { src: path.join(__dirname, "src", "storage"), dest: path.join(__dirname, "build", "storage") },
  { src: path.join(__dirname, "src", "utils"), dest: path.join(__dirname, "build", "utils") },
  { src: path.join(__dirname, "src", "models"), dest: path.join(__dirname, "build", "models") },
];

for (const p of pairs) {
  try {
    copyRecursiveSync(p.src, p.dest);
    console.error(`Copied ${p.src} -> ${p.dest}`);
  } catch (e) {
    console.error(`copy failed for ${p.src}`, e && e.message ? e.message : e);
  }
}
