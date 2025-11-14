import fs from "fs";
import path from "path";

const SRC = "src";
const BUILD = "build";

const DIRECTORIES_TO_COPY = [
  "controllers",
  "models",
  "core",
  "plugins",
  "utils"
];

// Copy JS/MJS/JSON only – TS is compiled by tsc
function copyRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;

  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  for (const item of fs.readdirSync(srcDir)) {
    const srcPath = path.join(srcDir, item);
    const destPath = path.join(destDir, item);

    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      if (srcPath.endsWith(".js") || srcPath.endsWith(".mjs") || srcPath.endsWith(".json")) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

for (const dir of DIRECTORIES_TO_COPY) {
  copyRecursive(path.join(SRC, dir), path.join(BUILD, dir));
}

console.log("✔ Copied all assets into build/");
