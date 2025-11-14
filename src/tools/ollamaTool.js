import ollama from "ollama";
import { save } from "../models/kryonexStorage.js";

const ollamaTool = {
    name: "ollamaChat",
    description: "Chat with Ollama locally with clean output (non-streaming)",
    schema: {
        type: "object",
        properties: {
            prompt: { type: "string" }
        },
        required: ["prompt"]
    },

    handler: async ({ prompt }, context) => {
        let output = "";

        const stream = await ollama.chat({
            model: "gemma3:1b",
            stream: true,
            messages: [{ role: "user", content: prompt }]
        });

        for await (const chunk of stream) {
            const content = chunk?.message?.content;
            if (content) output += content;
        }

        const chatLog = {
            prompt,
            response: output.trim(),
            timestamp: new Date().toISOString()
        };

        // IMPORTANT: Save using CONTEXT, not projectName
        await save(
            context,
            "ollama_chat_log",
            chatLog,
            "sessions"
        );

        return {
            success: true,
            message: `Ollama chat complete — response saved to .kryonex/sessions.`,
            response: output.trim()
        };
    }
};

export const name = ollamaTool.name;
export const description = ollamaTool.description;
export const schema = ollamaTool.schema;
export const handler = ollamaTool.handler;

export default ollamaTool;
