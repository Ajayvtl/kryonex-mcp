import path from 'path';
import { promises as fs } from 'fs';
import { resolveKryonexPath } from '../utils/pathResolver.mjs';
import { writeFileSafe, readFileSafe } from "../utils/fileUtils.mjs";
// Assuming 'my-new-server' is the project name for this MCP server
const PROJECT_NAME = 'my-new-server';

/**
 * Ensures the .kryonex directory and any specified subdirectories exist within the project.
 *
 * @param {string} projectName - The name of the project folder.
 * @param {string[]} subPaths - Optional subdirectories within .kryonex to ensure.
 */
async function ensureKryonexDir(projectName, ...subPaths) {
  const kryonexPath = resolveKryonexPath(projectName, ...subPaths);
  try {
    await fs.mkdir(kryonexPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      console.error(`Error ensuring .kryonex directory at ${kryonexPath}:`, error);
      throw error;
    }
  }
}

/**
 * Save JSON data into the .kryonex folder of the specified project.
 *
 * @param {string} projectName - The name of the project folder.
 * @param {string} fileName - The name of the file (without .json extension).
 * @param {object} data - The JSON data to save.
 * @param {string[]} subPaths - Optional subdirectories within .kryonex.
 * @returns {Promise<{ success: boolean, path?: string, error?: string }>}
 */
export async function save(projectName, fileName, data, ...subPaths) {
  try {
    await ensureKryonexDir(projectName, ...subPaths);
    const filePath = resolveKryonexPath(projectName, ...subPaths, `${fileName}.json`);

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');

    // IMPORTANT: logs MUST go to stderr to not break MCP
    console.error(`Kryonex: saved -> ${filePath}`);

    return { success: true, path: filePath };
  } catch (err) {
    console.error('Kryonex save error:', err);
    return { success: false, error: err.message };
  }
}


/**
 * Read JSON data from the .kryonex folder of the specified project.
 *
 * @param {string} projectName - The name of the project folder.
 * @param {string} fileName - The name of the file (without .json extension).
 * @param {string[]} subPaths - Optional subdirectories within .kryonex.
 * @returns {Promise<object | null>} The parsed JSON data, or null if not found/error.
 */
export async function load(projectName, fileName, ...subPaths) {
  try {
    const filePath = resolveKryonexPath(projectName, ...subPaths, `${fileName}.json`);

    // Check if the file exists before attempting to read
    try {
      await fs.access(filePath, fs.constants.F_OK); // Check if file exists
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // File not found, return null
      }
      throw error; // Other access error
    }

    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Kryonex load error:', err);
    return null;
  }
}
