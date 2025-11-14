import fs from "fs";
import path from "path";

/** folders to scan */
const ROOTS = [
  path.resolve("src"),
  path.resolve("src/tools"),
  path.resolve("src/utils"),
  path.resolve("src/controllers"),
  path.resolve("src/models")
];

function walk(dir) {
  let out = [];
  if (!fs.existsSync(dir)) return out;

  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out = out.concat(walk(full));
    else out.push(full);
  }
  return out;
}

function replaceInFile(file, replacements) {
  let txt = fs.readFileSync(file, "utf8");
  let orig = txt;

  for (const [from, to] of replacements) {
    txt = txt.split(from).join(to);
  }

  if (txt !== orig) {
    fs.writeFileSync(file, txt, "utf8");
    console.log("Patched:", file);
  }
}

const replacements = [
  // Fix kryonexStorage references
  ["../utils/kryonexStorage.mjs", "../models/kryonexStorage.mjs"],
  ["../utils/kryonexStorage.js", "../models/kryonexStorage.js"],
  ["./utils/kryonexStorage.js", "./models/kryonexStorage.js"],
  ["./kryonexStorage.js", "./models/kryonexStorage.js"],

  // Fix semanticStore / projectScanner
  ["../semanticStore.mjs", "../utils/semanticStore.mjs"],
  ["../semanticStore.js", "../utils/semanticStore.js"],
  ["./semanticStore.js", "./utils/semanticStore.js"],
  ["./semanticStore.mjs", "./utils/semanticStore.mjs"],

  ["../projectScanner.mjs", "../utils/projectScanner.mjs"],
  ["../projectScanner.js", "../utils/projectScanner.js"],
  ["./projectScanner.js", "./utils/projectScanner.js"],
  ["./projectScanner.mjs", "./utils/projectScanner.mjs"],

  // Fix languageDetection
  ["../languageDetection.js", "../utils/languageDetection.js"],
  ["./languageDetection.js", "./utils/languageDetection.js"]
];

// Run on all directories
for (const ROOT of ROOTS) {
  for (const file of walk(ROOT)) {
    if (file.endsWith(".js") || file.endsWith(".mjs")) {
      replaceInFile(file, replacements);
    }
  }
}

console.log("✔ All imports patched");
