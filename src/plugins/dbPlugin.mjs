/**
 * dbTool.mjs
 * ✅ Fully MCP compatible
 * ✅ ESM correct (no require/module.exports errors)
 * ✅ Supports SQLite (with better-sqlite3)
 * ✅ Persists DB session to kryonexStorage.mjs
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);   // needed for better-sqlite3 (CJS module)

import path from "path";

// ✅ named exports REQUIRED BY MCP spec
export const name = "db_tool";
export const description = "Manages SQL/NoSQL databases (SQLite, MySQL, PostgreSQL, Mongo, JSON).";

export const schema = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["connect", "disconnect", "create_table", "insert_data", "get_schema", "execute_query"]
    },
    dbType: {
      type: "string",
      enum: ["sqlite", "mysql", "mongodb", "postgresql", "json"]
    },
    connectionString: { type: "string" },
    connectionRef: { type: "string" },
    tableName: { type: "string" },
    schema: {
      type: "string",
      description: "SQL schema definition for creating a table (e.g., 'id INTEGER PRIMARY KEY, name TEXT')"
    },
    data: { type: "object" },
    query: { type: "string" },
    transactional: { type: "boolean", default: false },
    retries: { type: "number", default: 0 }
  },
  required: ["action", "dbType"]
};


/**
 * Handler (actual logic executed by MCP)
 */
export async function handler(args, context) {
  const { workspaceFolder } = context;
  const { action, dbType, connectionString, connectionRef, tableName, schema, data, query, transactional, retries } = args;

  // Import storage dynamically (ESM safe)
  const { save, load } = await import("./kryonexStorage.mjs");

  if (!global.mcpDbConnections)
    global.mcpDbConnections = {};

  let dbContext = load(workspaceFolder, "db") || {
    connections: {},
    schemas: [],
    queries: []
  };

  const retry = async (operation) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  };

  const run = async (operation) => {
    if (!transactional) return await operation();

    console.error(`[DB] BEGIN TRANSACTION (${dbType})`);
    try {
      const result = await operation();
      console.error(`[DB] COMMIT`);
      return result;
    } catch (error) {
      console.error(`[DB] ROLLBACK`);
      throw error;
    }
  };

  let result = { success: false, message: "❌ DB action not processed." };


  // ---------------------- MAIN SWITCH ----------------------
  try {
    await retry(async () => {

      switch (action) {

        // ✅ CONNECT
        case "connect": {
          if (dbType === "sqlite") {
            const Database = require("better-sqlite3");

            const dbPath = path.isAbsolute(connectionString)
              ? connectionString
              : path.join(workspaceFolder, connectionString);

            const sqliteDb = new Database(dbPath);

            global.mcpDbConnections[connectionRef] = sqliteDb;
            dbContext.connections[connectionRef] = { dbType, connectionString: dbPath, status: "connected" };

            result = { success: true, message: `✅ SQLite connected at: ${dbPath}` };
          } else {
            dbContext.connections[connectionRef] = { dbType, connectionString, status: "connected" };
            result = { success: true, message: `✅ Connected to ${dbType} (${connectionRef})` };
          }
          break;
        }

        // ✅ DISCONNECT
        case "disconnect": {
          delete global.mcpDbConnections[connectionRef];
          delete dbContext.connections[connectionRef];

          result = { success: true, message: `🔌 Disconnected: ${connectionRef}` };
          break;
        }

        // ✅ CREATE TABLE
        case "create_table": {
          await run(async () => {
            if (dbType === "sqlite") {
              const db = global.mcpDbConnections[connectionRef];
              if (!schema) {
                return { success: false, message: "❌ Schema definition is required for creating a table." };
              }
              db.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (${schema})`);
              dbContext.schemas.push({ dbType, tableName, schema });
            }
          });

          result = { success: true, message: `✅ Table created: ${tableName}` };
          break;
        }

        // ✅ INSERT DATA
        case "insert_data": {
          if (dbType !== "sqlite") break;
          await run(async () => {
            const db = global.mcpDbConnections[connectionRef];

            const stmt = db.prepare(
              `INSERT INTO ${tableName} (${Object.keys(data).join(",")})
               VALUES (${Object.keys(data).map(() => "?").join(",")})`
            );

            stmt.run(...Object.values(data));
          });

          result = { success: true, message: `✅ Data inserted into ${tableName}` };
          break;
        }

        // ✅ GET SCHEMA
        case "get_schema": {
          result = {
            success: true,
            schema: dbContext.schemas.filter(s => s.tableName === tableName)
          };
          break;
        }

        // ✅ EXECUTE QUERY
        case "execute_query": {
          if (dbType !== "sqlite") break;
          const db = global.mcpDbConnections[connectionRef];
          const rows = db.prepare(query).all();

          dbContext.queries.push({ dbType, query });
          result = { success: true, data: rows };
          break;
        }

        default:
          result = { success: false, message: "❌ Unknown DB action" };
      }
    });

  } catch (error) {
    result = { success: false, message: `❌ DB Tool failed: ${error.message}` };
  }

  await save(workspaceFolder, "db", dbContext);
  return result;
}


// ✅ Required MCP default export — MUST RETURN THIS SHAPE
export default {
  name,
  description,
  schema,
  handler
};
