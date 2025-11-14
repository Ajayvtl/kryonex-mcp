import fs from "fs";
import path from "path";

/**
 * Recursively copies only .js and .js files from src to build,
 * preserving directory structure correctly.
 */
function copyDir(srcDir, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      // Recursively process subdirectories
      copyDir(srcPath, destPath);
      continue;
    }

    // Only copy .js and .js files
    if (entry.name.endsWith(".js") || entry.name.endsWith(".js")) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Execute copy
copyDir("src", "build");

console.log("✅ Assets copied successfully!");
