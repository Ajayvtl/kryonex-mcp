import fs from "fs";
import path from "path";

const SRC = "src";
const BUILD = "build";

const DIRECTORIES_TO_COPY = [
  "controllers",
  "models",
  "core",
  "plugins",
  "utils",
  "storage" // Add storage directory
];

// Specific files to copy from src/tools to build/tools
const TOOLS_TO_COPY = [
  "dependencyFixTool.js",
  "dependencyGraphTool.js",
  "languageServerTool.js"
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

// Copy specific tools
const toolsSrcDir = path.join(SRC, "tools");
const toolsBuildDir = path.join(BUILD, "tools");
if (!fs.existsSync(toolsBuildDir)) fs.mkdirSync(toolsBuildDir, { recursive: true });

for (const toolFile of TOOLS_TO_COPY) {
  const srcPath = path.join(toolsSrcDir, toolFile);
  const destPath = path.join(toolsBuildDir, toolFile);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
  } else {
    console.warn(`Tool file not found: ${srcPath}`);
  }
}

console.log("✔ Copied all assets and tools into build/");
