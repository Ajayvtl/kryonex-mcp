import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const copyDirectory = (sourceDir, destinationDir, label) => {
  if (!fs.existsSync(sourceDir)) {
    console.warn(`⚠️ No ${label} folder found at ${sourceDir}. Skipping copy.`);
    return;
  }

  fs.mkdirSync(destinationDir, { recursive: true });

  for (const file of fs.readdirSync(sourceDir)) {
    fs.copyFileSync(
      path.join(sourceDir, file),
      path.join(destinationDir, file)
    );
  }
  console.log(`✅ ${label} copied → ${destinationDir}`);
};

// Copy tools
copyDirectory(
  path.join(__dirname, "src", "tools"),
  path.join(__dirname, "build", "tools"),
  "Tools"
);

// Copy models
copyDirectory(
  path.join(__dirname, "src", "models"),
  path.join(__dirname, "build", "models"),
  "Models"
);

// Copy utils
copyDirectory(
  path.join(__dirname, "src", "utils"),
  path.join(__dirname, "build", "utils"),
  "Utils"
);
