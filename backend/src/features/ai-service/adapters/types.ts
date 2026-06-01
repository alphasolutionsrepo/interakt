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
 * Parse SSE (Server-Sent Events) stream
 */
export async function* parseSSEStream(
    response: Response,
    providerKey: string
): AsyncGenerator<string, void, unknown> {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new AdapterError('No response body', providerKey);
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            // Split by double newline (SSE event separator)
            const events = buffer.split('\n\n');

            // Keep the last partial event in buffer
            buffer = events.pop() || '';

            for (const event of events) {
                // Skip empty events
                if (!event.trim()) continue;

                // Parse SSE format
                const lines = event.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data !== '[DONE]') {
                            yield data;
                        }
                    }
                }
            }
        }

        // Process any remaining data in buffer
        if (buffer.trim()) {
            const lines = buffer.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data !== '[DONE]') {
                        yield data;
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

/**
 * Parse Ollama NDJSON stream
 */
export async function* parseNDJSONStream(
    response: Response,
    providerKey: string
): AsyncGenerator<string, void, unknown> {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new AdapterError('No response body', providerKey);
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            // Split by newline (NDJSON format)
            const lines = buffer.split('\n');

            // Keep the last partial line in buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim()) {
                    yield line;
                }
            }
        }

        // Process any remaining data in buffer
        if (buffer.trim()) {
            yield buffer;
        }
    } finally {
        reader.releaseLock();
    }
}