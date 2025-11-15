#!/usr/bin/env node
/**
 * src/index.ts
 * Production MCP bootstrap — Option B (Smart Mode / CLINE-style rectifier)
 *
 * All tool invocations go through ToolRunner which performs:
 *  - validator.validateToolCall(...)
 *  - if rejected -> rectifier.rectify(...) (auto-rectify)
 *  - if rectified -> run tool with corrected args
 *  - else -> return MCP error
 *
 * Safety: No stdout writes except MCP protocol. Logs -> stderr + server.log.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { createWriteStream } from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";

// tools
import ollamaTool from "./tools/ollamaTool.js";

// system modules (assume present under src/system)
import EventBus from "./system/eventBus.mjs";
import TaskManager from "./system/taskManager.mjs";
import WorkflowEngine from "./system/workflowEngine.mjs";
import { InMemoryQueue } from "./system/taskQueue.mjs";
import ToolRunner from "./system/toolRunner.mjs";
import createValidator from "./system/validator.mjs";
import createRectifier from "./system/rectifier.mjs";

// agents
import createPlannerAgent from "./agents/plannerAgent.mjs";
import createInvestigatorAgent from "./agents/investigatorAgent.mjs";
import createRectifierAgent from "./agents/rectifierAgent.mjs";

// storage (exact function names are used)
import { openDb } from "./storage/kryonexDb.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

// --- logging (stderr + server.log) ---
const LOG_PATH = path.join(__dirname, "server.log");
const logStream = createWriteStream(LOG_PATH, { flags: "a" });

function writeLog(level: "INFO" | "WARN" | "ERROR", msg: string, ...args: any[]) {
  try {
    logStream.write(`[${new Date().toISOString()}] ${level}: ${msg} ${args.map(a => {
      try { return JSON.stringify(a); } catch { return String(a); }
    }).join(" ")}\n`);
  } catch { /* ignore */ }
  // human output - stderr only
  console.error(`${level}: ${msg}`, ...args);
}

const log = (m: string, ...a: any[]) => writeLog("INFO", m, ...a);
const warn = (m: string, ...a: any[]) => writeLog("WARN", m, ...a);
const errorLog = (m: string, ...a: any[]) => writeLog("ERROR", m, ...a);

// ensure .kryonex exists
const KRYONEX_DIR = path.join(PROJECT_ROOT, ".kryonex");
if (!fsSync.existsSync(KRYONEX_DIR)) fsSync.mkdirSync(KRYONEX_DIR, { recursive: true });

// --- open DB ---
log("Opening Kryonex DB...");
let kryonexDb: any;
try {
  kryonexDb = await openDb(path.join(PROJECT_ROOT, ".kryonex", "db.sqlite"));
  log("DB opened successfully");
} catch (e) {
  errorLog("Failed to open DB:", e instanceof Error ? e.message : String(e));
  process.exit(1);
}

// --- dynamic tool loader ---
export const toolHandlers: Record<string, any> = {};

async function loadTools() {
  const toolsDir = path.join(__dirname, "tools");
  log("Loading tools from", toolsDir);
  try {
    const entries = await fs.readdir(toolsDir);
    for (const f of entries) {
      if (!f.endsWith(".js")) continue;
      try {
        const mod = await import(`./tools/${f}`);
        const def = mod.default || mod;
        if (!def || !def.name || typeof def.handler !== "function") {
          warn(`Tool ./tools/${f} missing proper export { name, handler }`);
          continue;
        }
        toolHandlers[def.name] = def.handler;
        def.handler.description = def.description || def.handler.description || "";
        def.handler.schema = def.schema || def.handler.schema || { type: "object" };
        log(`Loaded tool ${def.name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warn(`Failed to import tool ${f}: ${msg}`);
      }
    }
  } catch (err) {
    warn("tools directory read failed:", err instanceof Error ? err.message : String(err));
  }
}

await loadTools();

// ensure ollama tool registered if available
try {
  if (ollamaTool && ollamaTool.name && typeof ollamaTool.handler === "function") {
    toolHandlers[ollamaTool.name] = ollamaTool.handler;
    log(`Registered ollama tool: ${ollamaTool.name}`);
  }
} catch (e) { warn("ollama registration failed:", e instanceof Error ? e.message : String(e)); }

// --- instantiate system services ---
const eventBus = new EventBus({ db: kryonexDb, semanticStore: null });
const taskManager = new TaskManager({ db: kryonexDb, eventBus });

try {
  await taskManager.loadFromDb();
  log("Loaded tasks from DB");
} catch (e) {
  warn("taskManager.loadFromDb failed", e instanceof Error ? e.message : String(e));
}

const workflow = new WorkflowEngine({ taskManager, eventBus, db: kryonexDb, concurrency: 4 });
const taskQueue = new InMemoryQueue();

const validator = createValidator({ ollamaTool });
const rectifier = createRectifier({ ollamaTool });

const toolRunner = new ToolRunner({ taskManager, eventBus, db: kryonexDb, semanticStore: null, validator, rectifier });

// agents
const plannerAgent = createPlannerAgent({ ollamaTool, workflowEngine: workflow, toolRunner, taskManager, eventBus });
const investigatorAgent = createInvestigatorAgent({ toolRunner, taskManager, eventBus });
const rectifierAgent = createRectifierAgent({ rectifier });

// expose global (ensure src/types/global.d.ts declares these)
global.__KRYONEX_EVENTBUS = eventBus;
global.__KRYONEX_TASKQUEUE = taskQueue;
global.__KRYONEX_WORKFLOW = workflow;
global.__KRYONEX_TOOLRUNNER = toolRunner;
global.__KRYONEX_DB = kryonexDb;
global.__KRYONEX_AGENTS = { plannerAgent, investigatorAgent, rectifierAgent };

// --- MCP server setup ---
const server = new Server(
  { name: "kryonex mcp", version: "0.1.0" },
  {
    capabilities: {
      tools: { listChanged: true },
      resources: { listChanged: true, subscribe: true },
      prompts: { listChanged: true },
    },
  }
);

// minimal resource read stub (never print to stdout)
server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  throw new Error("Resource reading is not implemented");
});

// list tools (include agents)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const dynamic = Object.entries(toolHandlers).map(([name, handler]) => ({
    name,
    description: handler.description || "No description",
    inputSchema: handler.schema || { type: "object" as const },
  }));
  const agentTools = [
    { name: "planner_agent", description: "Planner Agent", inputSchema: { type: "object" as const } },
    { name: "investigator_agent", description: "Investigator Agent", inputSchema: { type: "object" as const } },
  ];
  return { tools: [...agentTools, ...dynamic] };
});

// CALL TOOL handler (smart mode)
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const context = {
    projectRoot: PROJECT_ROOT,
    workspaceFolder: PROJECT_ROOT,
    serverRoot: __dirname,
    db: kryonexDb,
    toolHandlers,
    system: { eventBus, workflow, taskQueue, toolRunner },
    agents: global.__KRYONEX_AGENTS,
  };

  // agent shortcuts
  if (request.params.name === "planner_agent") {
    try {
      const intent = request.params.arguments?.intent ?? request.params.arguments ?? "run plan";
      const opts = request.params.arguments?.opts ?? {};
      const res = await plannerAgent.planAndExecute(intent, context, opts);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      throw new McpError(ErrorCode.InvalidParams, `Planner failed: ${m}`);
    }
  }

  if (request.params.name === "investigator_agent") {
    try {
      const payload = request.params.arguments ?? {};
      const res = await investigatorAgent.analyzeFailure(payload, context);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      throw new McpError(ErrorCode.InvalidParams, `Investigator failed: ${m}`);
    }
  }

  // dynamic tool
  const handler = toolHandlers[request.params.name];
  if (!handler) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);

  // Smart Mode: validator + rectifier (ToolRunner already calls validator internally,
  // but we implement an explicit flow to record rectification steps and log them)
  try {
    // First attempt via ToolRunner (ToolRunner will call validator and try rectifier internally if configured).
    // We call toolRunner.call which has validator and rectifier integrated by design.
    const result = await toolRunner.call(toolHandlers, request.params.name, request.params.arguments ?? {}, context);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    // If ToolRunner throws because validator rejected and rectifier didn't fix, we return an MCP error.
    const msg = err instanceof Error ? err.message : String(err);
    // Provide additional guidance in payload (avoid printing to stdout)
    throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${msg}`);
  }
});

// prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [{ name: "summarize_notes", description: "Summarize notes" }] }));
server.setRequestHandler(GetPromptRequestSchema, async (req) => {
  if (req.params.name !== "summarize_notes") throw new Error("Unknown prompt");
  return { messages: [{ role: "user", content: { type: "text", text: "No notes." } }] };
});

// start
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log("MCP server connected (stdio)");
  } catch (e) {
    errorLog("MCP server failed to start:", e instanceof Error ? e.stack ?? e.message : String(e));
    process.exit(1);
  }
}

main().catch((e) => {
  errorLog("Unhandled error in main:", e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
