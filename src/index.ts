#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "fs/promises";
import path from "path";
import { createWriteStream } from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";

import ollamaTool from "./tools/ollamaTool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// PROJECT ROOT = parent of build folder
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ------------ LOGGING (MCP SAFE: STDERR ONLY) ------------
const logStream = createWriteStream(path.join(__dirname, "server.log"), { flags: "a" });

const log = (message: string, ...args: any[]) => {
  logStream.write(`[${new Date().toISOString()}] ${message} ${args.map(a => JSON.stringify(a)).join(" ")}\n`);
  console.error(message, ...args); // STDERR only
};

const warn = (message: string, ...args: any[]) => {
  logStream.write(`[${new Date().toISOString()}] WARN: ${message} ${args.map(a => JSON.stringify(a)).join(" ")}\n`);
  console.error(`WARN: ${message}`, ...args); // MUST be stderr
};

// ------------ IN-MEMORY NOTES (EXAMPLE) ------------
type Note = { title: string; content: string };

const notes: Record<string, Note> = {
  "1": { title: "First Note", content: "This is note 1" },
  "2": { title: "Second Note", content: "This is note 2" },
};

// ------------ DYNAMIC TOOL LOADING ------------
const toolHandlers: Record<string, any> = {};

async function loadTools() {
  const toolsDir = path.join(__dirname, "tools");
  log(`Loading tools from: ${toolsDir}`);

  const files = await fs.readdir(toolsDir);

  for (const file of files) {
    if (!file.endsWith(".js")) continue;
    if (file === "ollamaTool.js") continue; // loaded manually

    try {
      const toolModule = await import(`./tools/${file}`);

      if (
        toolModule.default &&
        toolModule.default.name &&
        toolModule.default.schema &&
        toolModule.default.handler
      ) {
        toolHandlers[toolModule.default.name] = toolModule.default.handler;
        log(`Loaded tool: ${toolModule.default.name}`);
      } else {
        warn(`Invalid tool file: ${file}`);
      }
    } catch (err) {
      warn(`Failed to load tool ${file}:`, err);
    }
  }
}

await loadTools();

// Explicitly add ollama tool
toolHandlers[ollamaTool.name] = ollamaTool.handler;
log(`Explicitly added tool: ${ollamaTool.name}`);

// ------------ MCP SERVER SETUP ------------
const server = new Server(
  {
    name: "kryonex mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: { list: {}, call: {} },
      resources: { list: {}, read: {} },
      prompts: { list: {}, get: {} },
    },
  }
);

// ------------ RESOURCE LISTING ------------
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: Object.entries(notes).map(([id, note]) => ({
    uri: `note:///${id}`,
    mimeType: "text/plain",
    name: note.title,
    description: `A text note: ${note.title}`,
  })),
}));

// ------------ RESOURCE READING ------------
server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const url = new URL(req.params.uri);
  const id = url.pathname.replace(/^\//, "");
  const note = notes[id];

  if (!note) throw new Error(`Note ${id} not found`);

  return {
    contents: [{ uri: req.params.uri, mimeType: "text/plain", text: note.content }],
  };
});

// ------------ LIST TOOLS ------------
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_note",
      description: "Create a new note",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          content: { type: "string" },
        },
        required: ["title", "content"],
      },
    },
    {
      name: ollamaTool.name,
      description: ollamaTool.description,
      inputSchema: ollamaTool.schema,
    },
  ],
}));

// ------------ CALL TOOL ------------
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Build MCP-safe context
  const context = {
    projectRoot: PROJECT_ROOT,
    workspaceFolder: PROJECT_ROOT,
    serverRoot: __dirname,
  };

  switch (request.params.name) {
    case "create_note": {
      const t = request.params.arguments?.title;
      const c = request.params.arguments?.content;
      if (!t || !c) throw new McpError(ErrorCode.InvalidParams, "Missing title/content");

      const id = String(Object.keys(notes).length + 1);
      notes[id] = { title: String(t), content: String(c) };

      return { content: [{ type: "text", text: `Created note ${id}` }] };
    }

    default: {
      const handler = toolHandlers[request.params.name];
      if (!handler) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);

      const result = await handler(request.params.arguments, context);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  }
});

// ------------ PROMPTS ------------
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [{ name: "summarize_notes", description: "Summarize all notes" }],
}));

server.setRequestHandler(GetPromptRequestSchema, async (req) => {
  if (req.params.name !== "summarize_notes") throw new Error("Unknown prompt");

  const embedded = Object.entries(notes).map(([id, note]) => ({
    role: "user",
    content: { type: "resource", resource: { uri: `note:///${id}`, mimeType: "text/plain", text: note.content } },
  }));

  return {
    messages: [
      { role: "user", content: { type: "text", text: "Please summarize the following notes:" } },
      ...embedded,
    ],
  };
});

// ------------ START SERVER ------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server running on stdio");
}

main().catch((err) => {
  log("Server error:", err);
  process.exit(1);
});
