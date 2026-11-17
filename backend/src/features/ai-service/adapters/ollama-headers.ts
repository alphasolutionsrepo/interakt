// src/features/ai-service/adapters/ollama-headers.ts

/**
 * Headers for a request to an Ollama server: its API key as a bearer token when it has one, for
 * an Ollama behind a proxy or gateway that checks keys. A plain Ollama has none and gets none.
 */
export function ollamaHeaders(apiKey?: string | null, json = false): Record<string, string> {
    return {
        ...(json && { 'Content-Type': 'application/json' }),
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
    };
}
