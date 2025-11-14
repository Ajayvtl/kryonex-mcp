// mcp/plugins/codePatchPlugin.mjs
// AST-powered multi-language code patcher for MCP.
// Languages: JS/TS/JSX/TSX (recast + @babel/parser), JSON/JSONC (jsonc-parser), YAML (yaml)
// Optional: Python/Go via tree-sitter (if grammars installed). Graceful fallbacks included.

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const fs = require("fs");
const path = require("path");

// Optional deps wrapped in try-catch for graceful degradation
let recast, babelParser, jsonc, yaml, Parser, Python, Go;
try { recast = require("recast"); } catch {}
try { babelParser = require("@babel/parser"); } catch {}
try { jsonc = require("jsonc-parser"); } catch {}
try { yaml = require("yaml"); } catch {}
try { Parser = require("web-tree-sitter"); } catch {}

// Tree-sitter grammars (optional). Only loaded if Parser exists + grammars installed.
async function loadTreeSitterOnce() {
  if (!Parser) return null;
  if (loadTreeSitterOnce._loaded) return loadTreeSitterOnce._loaded;
  await Parser.init();
  const parser = new Parser();
  const langs = {};
  try {
    const pythonWasm = path.join(process.cwd(), "tree-sitter-langs", "python.wasm");
    if (fs.existsSync(pythonWasm)) {
      langs.python = await Parser.Language.load(pythonWasm);
    }
  } catch {}
  try {
    const goWasm = path.join(process.cwd(), "tree-sitter-langs", "go.wasm");
    if (fs.existsSync(goWasm)) {
      langs.go = await Parser.Language.load(goWasm);
    }
  } catch {}
  loadTreeSitterOnce._loaded = { parser, langs };
  return loadTreeSitterOnce._loaded;
}

export const name = "code_patch_ast";
export const description = "Patch code using ASTs for multiple languages (JS/TS/JSON/YAML + optional Python/Go via tree-sitter).";
export const schema = {
  type: "object",
  properties: {
    command: { type: "string", enum: ["patch"] },
    root: { type: "string", description: "Project root (relative). Defaults to workspace folder." },
    file: { type: "string", description: "File path relative to root." },
    language: {
      type: "string",
      enum: ["auto", "js", "ts", "jsx", "tsx", "json", "jsonc", "yaml", "yml", "python", "go"],
      default: "auto"
    },

    // Operation + arguments per language
    operation: {
      type: "string",
      enum: [
        "js_set_variable_init",
        "js_rename_identifier",
        "js_replace_call_arg",
        "json_set",
        "yaml_set",
        "py_rename_identifier",
        "go_rename_identifier"
      ]
    },

    // Common options
    dryRun: { type: "boolean", default: false },
    backup: { type: "boolean", default: true },
    normalizeEOL: { type: "string", enum: ["keep", "lf", "crlf"], default: "keep" },

    // JS ops
    varName: { type: "string", description: "Variable name for js_set_variable_init" },
    newInitExpr: { type: "string", description: "JS expression text for new initializer" },

    oldName: { type: "string", description: "Old identifier name for rename" },
    newName: { type: "string", description: "New identifier name for rename" },

    calleeName: { type: "string", description: "Target call callee, for js_replace_call_arg" },
    argIndex: { type: "number", description: "0-based argument index to replace" },
    newArgExpr: { type: "string", description: "JS expression text for the new argument" },

    // JSON/YAML ops
    keyPath: {
      type: "array",
      items: { type: "string" },
      description: "Path to set (e.g., [\"compilerOptions\",\"target\"])"
    },
    value: { description: "JSON/YAML value to set (string/number/bool/null/object/array). Provide as JSON-serializable." },

    // Python/Go ops
    oldIdent: { type: "string", description: "Old identifier for py/go rename" },
    newIdent: { type: "string", description: "New identifier for py/go rename" }
  },
  required: ["command", "file", "operation"]
};

// ---------- utilities ----------
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function readText(file) { return fs.readFileSync(file, "utf8"); }
function writeText(file, text) { fs.writeFileSync(file, text, "utf8"); }
function toLF(s) { return s.replace(/\r\n/g, "\n"); }
function toCRLF(s) { return s.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"); }
function applyEOL(s, mode, originalHadCRLF) {
  if (mode === "lf") return toLF(s);
  if (mode === "crlf") return toCRLF(s);
  // keep original style
  return originalHadCRLF ? toCRLF(toLF(s)) : toLF(s);
}
function makeBackup(projectRoot, relFile, content) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const destDir = path.join(projectRoot, ".kryonex", "patches", "backups", ts, path.dirname(relFile));
  ensureDir(destDir);
  const dest = path.join(destDir, path.basename(relFile));
  writeText(dest, content);
  return dest;
}
function detectLanguageFromExt(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".json" || ext === ".jsonc") return ext.slice(1);
  if (ext === ".yaml" || ext === ".yml") return ext.slice(1);
  if (ext === ".py") return "python";
  if (ext === ".go") return "go";
  if ([".ts", ".tsx"].includes(ext)) return ext.slice(1);
  if ([".js", ".jsx"].includes(ext)) return ext.slice(1);
  return "js"; // default
}

// ---------- JS/TS helpers ----------
function parseJs(code, filePath, lang) {
  if (!recast || !babelParser) throw new Error("JS/TS parser not available. Install 'recast' and '@babel/parser'.");
  const plugins = ["classProperties", "classPrivateProperties", "classPrivateMethods", "exportDefaultFrom", "exportNamespaceFrom", "objectRestSpread", "optionalChaining", "nullishCoalescingOperator", "topLevelAwait", "decorators-legacy", "dynamicImport"];
  if (lang === "ts" || lang === "tsx") plugins.push("typescript");
  if (lang === "jsx" || lang === "tsx") plugins.push("jsx");

  return recast.parse(code, {
    parser: {
      parse(source) {
        return babelParser.parse(source, {
          sourceType: "unambiguous",
          plugins
        });
      }
    },
    sourceFileName: filePath
  });
}
function printJs(ast) {
  return recast.print(ast, { quote: "single" }).code;
}
function parseJsExpr(exprText, lang) {
  // parse expression in a fake file
  const wrapped = `(${exprText})`;
  const ast = parseJs(wrapped, "expr.js", lang);
  // get Program.body[0].expression
  return ast.program.body[0].expression;
}

// JS op: set variable initializer
function jsSetVariableInit(ast, varName, newInitExprNode) {
  let changed = false;
  recast.types.visit(ast, {
    visitVariableDeclarator(p) {
      const n = p.value;
      if (n.id && n.id.name === varName) {
        if (!n.init || JSON.stringify(n.init) !== JSON.stringify(newInitExprNode)) {
          n.init = newInitExprNode;
          changed = true;
        }
      }
      this.traverse(p);
    }
  });
  return changed;
}

// JS op: rename identifier (simple file-level rename)
function jsRenameIdentifier(ast, oldName, newName) {
  let changed = false;
  recast.types.visit(ast, {
    visitIdentifier(p) {
      if (p.value.name === oldName) {
        p.value.name = newName;
        changed = true;
      }
      this.traverse(p);
    }
  });
  return changed;
}

// JS op: replace Nth argument of call by callee name
function jsReplaceCallArg(ast, calleeName, argIndex, newArgExprNode) {
  let changed = false;
  recast.types.visit(ast, {
    visitCallExpression(p) {
      const n = p.value;
      const callee = n.callee;
      let name = null;
      if (callee.type === "Identifier") name = callee.name;
      else if (callee.type === "MemberExpression" && callee.property.type === "Identifier") name = callee.property.name;
      if (name === calleeName && n.arguments && n.arguments.length > argIndex) {
        const prev = n.arguments[argIndex];
        if (JSON.stringify(prev) !== JSON.stringify(newArgExprNode)) {
          n.arguments[argIndex] = newArgExprNode;
          changed = true;
        }
      }
      this.traverse(p);
    }
  });
  return changed;
}

// ---------- JSON helpers ----------
function jsonSet(content, keyPath, value) {
  if (!jsonc) throw new Error("jsonc-parser not installed.");
  const edits = jsonc.modify(content, keyPath, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } });
  return jsonc.applyEdits(content, edits);
}

// ---------- YAML helpers ----------
function yamlSet(content, keyPath, value) {
  if (!yaml) throw new Error("yaml not installed.");
  const doc = yaml.parseDocument(content);
  let node = doc;
  for (let i = 0; i < keyPath.length - 1; i++) {
    const k = keyPath[i];
    if (!node.has) node.set = () => {}; // guard for non-map nodes
    if (!node.has(k)) node.set(k, new yaml.Document().createNode({}));
    node = node.get(k);
  }
  const last = keyPath[keyPath.length - 1];
  node.set(last, value);
  return String(doc);
}

// ---------- Python/Go via tree-sitter (optional demo rename) ----------
async function pyOrGoRename(fileContent, lang, oldIdent, newIdent) {
  const ts = await loadTreeSitterOnce();
  if (!ts) throw new Error("tree-sitter not available. Install 'web-tree-sitter' and language .wasm grammars.");
  const { parser, langs } = ts;

  if (lang === "python" && !langs.python) throw new Error("tree-sitter Python grammar missing. Place python.wasm under ./tree-sitter-langs/");
  if (lang === "go" && !langs.go) throw new Error("tree-sitter Go grammar missing. Place go.wasm under ./tree-sitter-langs/");

  parser.setLanguage(lang === "python" ? langs.python : langs.go);
  const tree = parser.parse(fileContent);

  // Extremely simple token replacement (identifier level).
  // For production, implement scope-aware rename using queries.
  const re = new RegExp(`\\b${oldIdent}\\b`, "g");
  if (!re.test(fileContent)) return { changed: false, content: fileContent };
  const out = fileContent.replace(re, newIdent);
  return { changed: out !== fileContent, content: out };
}

// ---------- main handler ----------
export async function handler(args, { workspaceFolder }) {
  if (args.command !== "patch") return "⚠ Unknown command";

  const projectRoot = args.root ? path.resolve(workspaceFolder, args.root) : workspaceFolder;
  const absFile = path.resolve(projectRoot, args.file);
  if (!fs.existsSync(absFile)) return `❌ File not found: ${absFile}`;

  const original = readText(absFile);
  const hadCRLF = /\r\n/.test(original);

  let language = args.language && args.language !== "auto" ? args.language : detectLanguageFromExt(absFile);
  let changed = false, output = original;

  try {
    switch (args.operation) {
      // JS / TS ops
      case "js_set_variable_init": {
        if (!recast || !babelParser) return "❌ Missing deps: npm i recast @babel/parser";
        if (!args.varName || !args.newInitExpr) return "❌ Provide varName and newInitExpr";

        const lang = language === "auto" ? detectLanguageFromExt(absFile) : language;
        const ast = parseJs(original, absFile, lang);
        const initNode = parseJsExpr(args.newInitExpr, lang);

        changed = jsSetVariableInit(ast, args.varName, initNode);
        output = changed ? printJs(ast) : original;
        break;
      }

      case "js_rename_identifier": {
        if (!recast || !babelParser) return "❌ Missing deps: npm i recast @babel/parser";
        if (!args.oldName || !args.newName) return "❌ Provide oldName and newName";
        const lang = language === "auto" ? detectLanguageFromExt(absFile) : language;
        const ast = parseJs(original, absFile, lang);
        changed = jsRenameIdentifier(ast, args.oldName, args.newName);
        output = changed ? printJs(ast) : original;
        break;
      }

      case "js_replace_call_arg": {
        if (!recast || !babelParser) return "❌ Missing deps: npm i recast @babel/parser";
        if (typeof args.argIndex !== "number" || !args.calleeName || !args.newArgExpr) {
          return "❌ Provide calleeName, argIndex, newArgExpr";
        }
        const lang = language === "auto" ? detectLanguageFromExt(absFile) : language;
        const ast = parseJs(original, absFile, lang);
        const expr = parseJsExpr(args.newArgExpr, lang);
        changed = jsReplaceCallArg(ast, args.calleeName, args.argIndex, expr);
        output = changed ? printJs(ast) : original;
        break;
      }

      // JSON/JSONC
      case "json_set": {
        if (!jsonc) return "❌ Missing deps: npm i jsonc-parser";
        if (!args.keyPath || !Array.isArray(args.keyPath)) return "❌ Provide keyPath: string[]";
        output = jsonSet(original, args.keyPath, args.value);
        changed = output !== original;
        break;
      }

      // YAML
      case "yaml_set": {
        if (!yaml) return "❌ Missing deps: npm i yaml";
        if (!args.keyPath || !Array.isArray(args.keyPath)) return "❌ Provide keyPath: string[]";
        output = yamlSet(original, args.keyPath, args.value);
        changed = output !== original;
        break;
      }

      // Python / Go (optional demo rename)
      case "py_rename_identifier":
      case "go_rename_identifier": {
        const lang = operationToLang(args.operation);
        const res = await pyOrGoRename(original, lang, args.oldIdent, args.newIdent);
        changed = res.changed;
        output = res.content;
        break;
      }

      default:
        return "⚠ Unsupported operation";
    }
  } catch (e) {
    return `❌ AST patch failed: ${e.message}`;
  }

  // idempotence
  if (!changed) return "✅ No changes needed (already up-to-date or target not found).";

  // EOL handling
  const finalText = applyEOL(output, args.normalizeEOL || "keep", hadCRLF);

  // dry-run
  if (args.dryRun) {
    const preview = [
      "🔎 Dry-run (first 300 chars after patch):",
      finalText.slice(0, 300)
    ].join("\n");
    return preview;
  }

  // backup
  if (args.backup !== false) {
    const rel = path.relative(projectRoot, absFile);
    makeBackup(projectRoot, rel, original);
  }

  writeText(absFile, finalText);
  return `✅ AST patch applied: ${path.relative(projectRoot, absFile)}`;
}

function operationToLang(op) {
  if (op.startsWith("py_")) return "python";
  if (op.startsWith("go_")) return "go";
  return "unknown";
}

export default {
  name,
  description,
  schema,
  handler
};

