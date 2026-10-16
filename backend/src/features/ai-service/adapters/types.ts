// src/features/ai-service/adapters/types.ts

/**
 * AI Provider Adapter Interface
 * 
 * All provider adapters must implement this interface.
 * This provides a consistent API across different AI providers.
 */

import type {
    AdapterConfig,
    AdapterTextResponse,
    AdapterChatResponse,
    AdapterEmbeddingResponse,
    AdapterStreamChunk,
    TextGenerationRequest,
    ChatRequest,
    EmbeddingRequest,
    AIOperation,
} from '../ai-service.types';

// ============================================================================
// ADAPTER INTERFACE
// ============================================================================

/**
 * Base interface for all AI provider adapters
 */
export interface AIProviderAdapter {
    /**
     * Unique key for this provider (matches providerKey in database)
     */
    readonly providerKey: string;

    /**
     * Display name for logging/debugging
     */
    readonly displayName: string;

    /**
     * Check if adapter supports a specific operation
     */
    supportsOperation(operation: AIOperation): boolean;

    /**
     * Generate text (non-streaming)
     */
    generateText(
        request: TextGenerationRequest,
        config: AdapterConfig
    ): Promise<AdapterTextResponse>;

    /**
     * Chat completion (non-streaming)
     */
    chat(
        request: ChatRequest,
        config: AdapterConfig
    ): Promise<AdapterChatResponse>;

    /**
     * Stream chat completion
     * Returns an async generator yielding chunks
     */
    streamChat(
        request: ChatRequest,
        config: AdapterConfig
    ): AsyncGenerator<AdapterStreamChunk, void, unknown>;

    /**
     * Generate embeddings for multiple texts
     */
    generateEmbeddings(
        request: EmbeddingRequest,
        config: AdapterConfig
    ): Promise<AdapterEmbeddingResponse>;
}

// ============================================================================
// ADAPTER ERROR
// ============================================================================

/**
 * Error thrown by adapters with provider-specific details
 */
export class AdapterError extends Error {
    constructor(
        message: string,
        public readonly providerKey: string,
        public readonly statusCode?: number,
        public readonly retryable: boolean = false,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'AdapterError';
    }

    /**
     * Check if error is due to rate limiting
     */
    isRateLimited(): boolean {
        return this.statusCode === 429;
    }

    /**
     * Check if error is due to authentication
     */
    isAuthError(): boolean {
        return this.statusCode === 401 || this.statusCode === 403;
    }

    /**
     * Check if error is due to invalid request
     */
    isInvalidRequest(): boolean {
        return this.statusCode === 400;
    }

    /**
     * Check if error is server-side (potentially retryable)
     */
    isServerError(): boolean {
        return this.statusCode !== undefined && this.statusCode >= 500;
    }
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Options for fetch requests within adapters
 */
export interface AdapterFetchOptions {
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
}

/**
 * Read a provider's streaming response body as text.
 *
 * A caller that stops early (a summary the visitor cancelled) closes the body,
 * which drops the connection, so the provider stops generating. Releasing the
 * reader alone would leave the request running to its token limit.
 */
async function* readStreamText(
    response: Response,
    providerKey: string
): AsyncGenerator<string, void, unknown> {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new AdapterError('No response body', providerKey);
    }

    const decoder = new TextDecoder();
    let finished = false;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                finished = true;
                return;
            }
            yield decoder.decode(value, { stream: true });
        }
    } finally {
        if (!finished) {
            await reader.cancel().catch(() => { /* already closed */ });
        }
        reader.releaseLock();
    }
}

/**
 * Split streamed text into records at a separator, keeping a partial record
 * until the rest of it arrives.
 */
async function* splitRecords(
    text: AsyncGenerator<string, void, unknown>,
    separator: string
): AsyncGenerator<string, void, unknown> {
    let buffer = '';
    for await (const chunk of text) {
        buffer += chunk;
        const records = buffer.split(separator);
        buffer = records.pop() || '';
        yield* records;
    }
    if (buffer) yield buffer;
}

/**
 * Parse SSE (Server-Sent Events) stream
 */
export async function* parseSSEStream(
    response: Response,
    providerKey: string
): AsyncGenerator<string, void, unknown> {
    for await (const event of splitRecords(readStreamText(response, providerKey), '\n\n')) {
        if (!event.trim()) continue;
        for (const line of event.split('\n')) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data !== '[DONE]') {
                    yield data;
                }
            }
        }
    }
}

/**
 * Parse Ollama NDJSON stream
 */
export async function* parseNDJSONStream(
    response: Response,
    providerKey: string
): AsyncGenerator<string, void, unknown> {
    for await (const line of splitRecords(readStreamText(response, providerKey), '\n')) {
        if (line.trim()) {
            yield line;
        }
    }
}