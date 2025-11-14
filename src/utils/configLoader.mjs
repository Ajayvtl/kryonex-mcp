import fs from "fs";
import path from "path";

export async function loadConfig(root) {
  const cfgPath = path.join(root, ".kryonex", "tools-config.json");

  if (!fs.existsSync(cfgPath)) {
    return { projects: {}, detected: {}, created: new Date().toISOString() };
  }

  return JSON.parse(fs.readFileSync(cfgPath, "utf8"));
}

export async function saveConfig(root, cfg) {
  const dir = path.join(root, ".kryonex");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const cfgPath = path.join(dir, "tools-config.json");
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
}
