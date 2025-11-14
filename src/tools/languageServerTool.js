import { fileURLToPath } from 'url';
import path from 'path';
import fssync from 'fs'; // For synchronous operations like existsSync
import fs from 'fs/promises'; // Added for file reading
import * as babelParser from '@babel/parser';
import generate from '@babel/generator';
import traverse from '@babel/traverse';
import { resolveWorkspacePath } from "../utils/pathResolver.js";
import projectScanner from "../utils/projectScanner.js";
import semanticStore from "../utils/semanticStore.js";
import languageDetection from "../utils/languageDetection.js";
import frameworkDetection from "../utils/frameworkDetection.js";

// Import web-tree-sitter components
import { Parser } from "web-tree-sitter";
// Note: Language.load will be called dynamically based on detected language

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const languageServerTool = {
    name: 'mcp_language_server',
    description: 'Analyzes code for errors and provides suggestions for fixes, including auto-correction.',
    schema: {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                description: 'The action to perform (e.g., autocomplete_symbol, find_definition, list_symbols, reference_search, infer_types, generate_docstring).',
                enum: ['autocomplete_symbol', 'find_definition', 'list_symbols', 'reference_search', 'infer_types', 'generate_docstring', 'analyze_code']
            },
            language: {
                type: 'string',
                description: 'The programming language of the code snippet (e.g., javascript, python, java).'
            },
            code: {
                type: 'string',
                description: 'The code snippet to analyze.'
            },
            filePath: {
                type: 'string',
                description: 'The path to the file to analyze (optional, if code is provided directly).'
            },
            symbolName: {
                type: 'string',
                description: 'The name of the symbol for definition/reference search.'
            },
            lineNumber: {
                type: 'number',
                description: 'The line number for context-aware actions.'
            },
            columnNumber: {
                type: 'number',
                description: 'The column number for context-aware actions.'
            }
        },
        required: ['action', 'language']
    },

    handler: async (args, context) => {
        const { workspaceFolder, projectRoot, db } = context;
        let { action, language, code, filePath, symbolName, lineNumber, columnNumber } = args;
        console.log("MCP_LANGUAGE_SERVER_TOOL_V2_LOADED");

        if (filePath) {
            filePath = resolveWorkspacePath(context, filePath);
            try {
                code = await fs.readFile(filePath, 'utf8');
            } catch (error) {
                return { success: false, error: `Failed to read file: ${filePath}. ${error.message}` };
            }
        } else if (!code && action !== 'list_symbols') { // code is not strictly required for list_symbols if scanning project
            return { success: false, error: "Either 'code' or 'filePath' must be provided for most actions." };
        }

        // Initialize web-tree-sitter parser
        await Parser.init();
        const parser = new Parser();
        let treeSitterLanguage;

        // Detect language and load appropriate grammar
        // This is a simplified example, a real implementation would map 'language' to 'tree-sitter-X.wasm'
        switch (language.toLowerCase()) {
            case 'javascript':
            case 'typescript':
                treeSitterLanguage = await Parser.Language.load("tree-sitter-javascript.wasm"); // Assuming JS grammar for TS for now
                break;
            case 'python':
                treeSitterLanguage = await Parser.Language.load("tree-sitter-python.wasm");
                break;
            // Add more languages as needed
            default:
                return { success: false, error: `Unsupported language for web-tree-sitter: ${language}` };
        }
        parser.setLanguage(treeSitterLanguage);

        // Scan project and detect language/framework
        const files = await projectScanner.scanProject(projectRoot);
        const detectedLang = languageDetection.detectLanguage(files);
        const detectedFramework = frameworkDetection.detectFramework(files);

        console.log(`Detected Language: ${detectedLang}, Framework: ${detectedFramework}`);

        let diagnostics = [];
        let fixedCode = code;
        let suggestion = '';
        let save = null;

        try {
            // dynamic import (ESM/CJS compatible)
            const storage = await import('./kryonexStorage.mjs');
            save = storage.save;

            // Parse code with web-tree-sitter
            const tree = parser.parse(code);
            // console.log("Tree-sitter AST:", tree.rootNode.toString()); // For debugging

            switch (action) {
                case 'autocomplete_symbol':
                    // Implement autocomplete logic using tree-sitter AST
                    return { success: true, result: `Autocomplete for ${symbolName} at line ${lineNumber}, column ${columnNumber} (Not yet implemented)` };
                case 'find_definition':
                    // Implement find definition logic using tree-sitter AST and semanticStore
                    return { success: true, result: `Definition for ${symbolName} (Not yet implemented)` };
                case 'list_symbols':
                    // Implement list symbols logic using tree-sitter AST and semanticStore
                    // Example: Extract function and class names
                    const symbols = [];
                    tree.rootNode.walk((node) => {
                        if (node.type === 'function_declaration' || node.type === 'class_declaration') {
                            const nameNode = node.childForFieldName('name');
                            if (nameNode) {
                                symbols.push({ name: nameNode.text, type: node.type });
                            }
                        }
                    });
                    return { success: true, result: symbols };
                case 'reference_search':
                    // Implement reference search logic using tree-sitter AST and semanticStore
                    return { success: true, result: `References for ${symbolName} (Not yet implemented)` };
                case 'infer_types':
                    // Implement type inference logic using tree-sitter AST
                    return { success: true, result: `Inferred types for ${symbolName} (Not yet implemented)` };
                case 'generate_docstring':
                    // Implement docstring generation logic using tree-sitter AST
                    return { success: true, result: `Docstring for ${symbolName} (Not yet implemented)` };
                case 'analyze_code':
                default:
                    // Fallback to basic analysis or error reporting
                    // For now, we'll just return the tree-sitter AST as a string for basic analysis
                    return { success: true, result: { ast: tree.rootNode.toString(), detectedLang, detectedFramework } };
            }
        } catch (e) {
            diagnostics.push({
                severity: 'error',
                range: {
                    start: { line: e.loc?.line - 1 || 0, character: e.loc?.column || 0 },
                    end: { line: e.loc?.line - 1 || 0, character: (e.loc?.column || 0) + 1 }
                },
                message: e.message,
                source: 'languageServerTool'
            });
            suggestion = `Error in language server tool: ${e.message}`;
            fixedCode = null;
        }

        const analysisResult = {
            language,
            originalCode: code,
            diagnostics,
            suggestion,
            fixedCode,
            patch: fixedCode && fixedCode !== code ? generatePatch(code, fixedCode) : null,
            timestamp: new Date().toISOString()
        };

        if (save) await save(workspaceFolder, 'language_analysis', analysisResult);

        return {
            success: true,
            message: `Code analysis complete ✅ — saved to .kryonex/language_analysis.json.`
        };
    }
};

function generatePatch(original, fixed) {
    const originalLines = original.split('\n');
    const fixedLines = fixed.split('\n');
    let patch = '';

    for (let i = 0; i < Math.max(originalLines.length, fixedLines.length); i++) {
        const originalLine = originalLines[i];
        const fixedLine = fixedLines[i];

        if (originalLine !== fixedLine) {
            if (originalLine !== undefined) {
                patch += `--- a/${i + 1}\n- ${originalLine}\n`;
            }
            if (fixedLine !== undefined) {
                patch += `+++ b/${i + 1}\n+ ${fixedLine}\n`;
            }
        }
    }
    return patch;
}
export const name = languageServerTool.name;
export const description = languageServerTool.description;
export const schema = languageServerTool.schema;
export const handler = languageServerTool.handler;
export default languageServerTool;
