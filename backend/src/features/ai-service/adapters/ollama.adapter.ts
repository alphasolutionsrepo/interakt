// src/features/ai-service/adapters/ollama.adapter.ts

/**
 * Ollama Adapter
 * 
 * Implements AI provider adapter for Ollama API.
 * Supports chat completions, text generation, streaming, and embeddings.
 * 
 * Ollama API docs: https://github.com/ollama/ollama/blob/main/docs/api.md
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
    TokenUsage,
    ResponseFormat,
} from '../ai-service.types';

import { AIProviderAdapter, AdapterError, parseNDJSONStream } from './types';

/**
 * Ollama's structured-output `format` field. Ollama 0.5+ accepts a full JSON
 * Schema object (constrained decoding); older versions accept the string "json"
 * to merely force valid JSON. Maps our provider-neutral ResponseFormat onto it.
 */
type OllamaFormat = 'json' | Record<string, unknown>;

function toOllamaFormat(responseFormat?: ResponseFormat): OllamaFormat | undefined {
    if (!responseFormat) return undefined;
    if (responseFormat.type === 'json_schema') {
        // Pass the raw JSON Schema so the model is constrained to it. Falls back
        // to plain JSON mode if the schema is somehow absent.
        return (responseFormat.json_schema?.schema as Record<string, unknown>) ?? 'json';
    }
    if (responseFormat.type === 'json_object') return 'json';
    return undefined; // 'text' → no constraint
}

// ============================================================================
// OLLAMA API TYPES
// ============================================================================

interface OllamaGenerateRequest {
    model: string;
    prompt: string;
    system?: string;
    stream?: boolean;
    format?: OllamaFormat;
    options?: {
        temperature?: number;
        top_p?: number;
        num_predict?: number;
        stop?: string[];
    };
    keep_alive?: string;
}

interface OllamaGenerateResponse {
    model: string;
    created_at: string;
    response: string;
    done: boolean;
    context?: number[];
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
}

interface OllamaChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface OllamaChatRequest {
    model: string;
    messages: OllamaChatMessage[];
    stream?: boolean;
    format?: OllamaFormat;
    options?: {
        temperature?: number;
        top_p?: number;
        num_predict?: number;
        stop?: string[];
    };
    keep_alive?: string;
}

interface OllamaChatResponse {
    model: string;
    created_at: string;
    message: OllamaChatMessage;
    done: boolean;
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
}

interface OllamaEmbeddingRequest {
    model: string;
    input: string | string[];
}

interface OllamaEmbeddingResponse {
    model: string;
    embeddings: number[][];
}

// Legacy endpoint response (single embedding)
interface OllamaLegacyEmbeddingResponse {
    embedding: number[];
}

// ============================================================================
// OLLAMA ADAPTER
// ============================================================================

export class OllamaAdapter implements AIProviderAdapter {
    readonly providerKey = 'ollama';
    readonly displayName = 'Ollama';

    /**
     * Check if operation is supported
     */
    supportsOperation(operation: AIOperation): boolean {
        return ['text', 'chat', 'embedding'].includes(operation);
    }

    /**
     * Generate text using /api/generate
     */
    async generateText(
        request: TextGenerationRequest,
        config: AdapterConfig
    ): Promise<AdapterTextResponse> {
        const ollamaRequest: OllamaGenerateRequest = {
            model: config.modelKey,
            prompt: request.prompt,
            ...(request.systemPrompt && { system: request.systemPrompt }),
            stream: false,
            options: {
                ...(request.maxTokens && { num_predict: request.maxTokens }),
                ...(request.temperature !== undefined && { temperature: request.temperature }),
                ...(request.topP !== undefined && { top_p: request.topP }),
                ...(request.stopSequences?.length && { stop: request.stopSequences }),
            },
            ...(config.settings?.keepAlive && { keep_alive: config.settings.keepAlive as string }),
        };

        const response = await this.makeRequest<OllamaGenerateResponse>(
            `${config.baseUrl}/api/generate`,
            ollamaRequest,
            config
        );

        const usage = this.extractUsage(response);

        return {
            text: response.response,
            usage,
            finishReason: response.done ? 'stop' : 'error',
        };
    }

    /**
     * Convert messages to Ollama-compatible format
     * Ollama only supports system, user, and assistant roles
     */
    private convertMessages(messages: ChatRequest['messages']): OllamaChatMessage[] {
        return messages
            .filter(m => m.role !== 'tool')
            .map(m => ({
                role: m.role as 'system' | 'user' | 'assistant',
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            }));
    }

    /**
     * Chat completion using /api/chat
     */
    async chat(
        request: ChatRequest,
        config: AdapterConfig
    ): Promise<AdapterChatResponse> {
        const format = toOllamaFormat(request.responseFormat);
        const ollamaRequest: OllamaChatRequest = {
            model: config.modelKey,
            messages: this.convertMessages(request.messages),
            stream: false,
            ...(format && { format }),
            options: {
                ...(request.maxTokens && { num_predict: request.maxTokens }),
                ...(request.temperature !== undefined && { temperature: request.temperature }),
                ...(request.topP !== undefined && { top_p: request.topP }),
                ...(request.stopSequences?.length && { stop: request.stopSequences }),
            },
            ...(config.settings?.keepAlive && { keep_alive: config.settings.keepAlive as string }),
        };

        const response = await this.makeRequest<OllamaChatResponse>(
            `${config.baseUrl}/api/chat`,
            ollamaRequest,
            config
        );

        const usage = this.extractUsageFromChat(response);

        return {
            message: {
                role: response.message.role,
                content: response.message.content,
            },
            usage,
            finishReason: response.done ? 'stop' : 'error',
        };
    }

    /**
     * Stream chat completion
     */
    async *streamChat(
        request: ChatRequest,
        config: AdapterConfig
    ): AsyncGenerator<AdapterStreamChunk, void, unknown> {
        const format = toOllamaFormat(request.responseFormat);
        const ollamaRequest: OllamaChatRequest = {
            model: config.modelKey,
            messages: this.convertMessages(request.messages),
            stream: true,
            ...(format && { format }),
            options: {
                ...(request.maxTokens && { num_predict: request.maxTokens }),
                ...(request.temperature !== undefined && { temperature: request.temperature }),
                ...(request.topP !== undefined && { top_p: request.topP }),
                ...(request.stopSequences?.length && { stop: request.stopSequences }),
            },
            ...(config.settings?.keepAlive && { keep_alive: config.settings.keepAlive as string }),
        };

        const response = await this.makeStreamRequest(
            `${config.baseUrl}/api/chat`,
            ollamaRequest,
            config
        );

        let fullContent = '';
        let lastChunk: OllamaChatResponse | null = null;

        for await (const data of parseNDJSONStream(response, this.providerKey)) {
            try {
                const chunk: OllamaChatResponse = JSON.parse(data);

                if (chunk.message?.content) {
                    fullContent += chunk.message.content;
                    yield {
                        content: chunk.message.content,
                        done: false,
                    };
                }

                if (chunk.done) {
                    lastChunk = chunk;
                }
            } catch {
                // Skip invalid JSON chunks
                continue;
            }
        }

        // Final chunk with usage
        const usage = lastChunk
            ? this.extractUsageFromChat(lastChunk)
            : this.estimateUsage(request, fullContent);

        yield {
            content: '',
            done: true,
            usage,
            finishReason: 'stop',
        };
    }

    /**
     * Generate embeddings using /api/embed (or /api/embeddings for older versions)
     */
    async generateEmbeddings(
        request: EmbeddingRequest,
        config: AdapterConfig
    ): Promise<AdapterEmbeddingResponse> {
        const ollamaRequest: OllamaEmbeddingRequest = {
            model: config.modelKey,
            input: request.texts,
        };

        try {
            // Try new /api/embed endpoint first (Ollama 0.1.44+)
            const response = await this.makeRequest<OllamaEmbeddingResponse>(
                `${config.baseUrl}/api/embed`,
                ollamaRequest,
                config
            );

            return {
                embeddings: response.embeddings,
                usage: this.estimateEmbeddingUsage(request.texts),
                dimensions: response.embeddings[0]?.length ?? 0,
            };
        } catch (error) {
            // Fall back to legacy /api/embeddings endpoint (processes one at a time)
            if ((error as AdapterError).statusCode === 404) {
                return this.generateEmbeddingsLegacy(request, config);
            }
            throw error;
        }
    }

    /**
     * Legacy embedding generation (one at a time)
     */
    private async generateEmbeddingsLegacy(
        request: EmbeddingRequest,
        config: AdapterConfig
    ): Promise<AdapterEmbeddingResponse> {
        const embeddings: number[][] = [];

        for (const text of request.texts) {
            const response = await this.makeRequest<OllamaLegacyEmbeddingResponse>(
                `${config.baseUrl}/api/embeddings`,
                {
                    model: config.modelKey,
                    prompt: text,
                },
                config
            );

            embeddings.push(response.embedding);
        }

        return {
            embeddings,
            usage: this.estimateEmbeddingUsage(request.texts),
            dimensions: embeddings[0]?.length ?? 0,
        };
    }

    // ============================================================================
    // PRIVATE HELPERS
    // ============================================================================

    /**
     * Make a non-streaming request
     */
    private async makeRequest<T>(
        url: string,
        body: unknown,
        config: AdapterConfig
    ): Promise<T> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                await this.handleErrorResponse(response);
            }

            return await response.json() as T;
        } catch (error) {
            clearTimeout(timeoutId);

            if (error instanceof AdapterError) {
                throw error;
            }

            if (error instanceof Error && error.name === 'AbortError') {
                throw new AdapterError(
                    'Request timed out',
                    this.providerKey,
                    undefined,
                    true
                );
            }

            // Check if Ollama is not running
            if ((error as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
                throw new AdapterError(
                    'Ollama is not running. Please start Ollama and try again.',
                    this.providerKey,
                    undefined,
                    true
                );
            }

            throw new AdapterError(
                `Network error: ${(error as Error).message}`,
                this.providerKey,
                undefined,
                true,
                error as Error
            );
        }
    }

    /**
     * Make a streaming request
     */
    private async makeStreamRequest(
        url: string,
        body: unknown,
        config: AdapterConfig
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                await this.handleErrorResponse(response);
            }

            return response;
        } catch (error) {
            clearTimeout(timeoutId);

            if (error instanceof AdapterError) {
                throw error;
            }

            if (error instanceof Error && error.name === 'AbortError') {
                throw new AdapterError(
                    'Request timed out',
                    this.providerKey,
                    undefined,
                    true
                );
            }

            if ((error as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
                throw new AdapterError(
                    'Ollama is not running. Please start Ollama and try again.',
                    this.providerKey,
                    undefined,
                    true
                );
            }

            throw new AdapterError(
                `Network error: ${(error as Error).message}`,
                this.providerKey,
                undefined,
                true,
                error as Error
            );
        }
    }

    /**
     * Handle error response
     */
    private async handleErrorResponse(response: Response): Promise<never> {
        let errorMessage = `HTTP ${response.status}`;

        try {
            const errorBody = await response.json() as { error?: string };
            errorMessage = errorBody.error || errorMessage;
        } catch {
            // Ignore JSON parse errors
        }

        const retryable = response.status >= 500;

        throw new AdapterError(
            errorMessage,
            this.providerKey,
            response.status,
            retryable
        );
    }

    /**
     * Extract usage from generate response
     */
    private extractUsage(response: OllamaGenerateResponse): TokenUsage {
        return {
            inputTokens: response.prompt_eval_count ?? 0,
            outputTokens: response.eval_count ?? 0,
            totalTokens: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
        };
    }

    /**
     * Extract usage from chat response
     */
    private extractUsageFromChat(response: OllamaChatResponse): TokenUsage {
        return {
            inputTokens: response.prompt_eval_count ?? 0,
            outputTokens: response.eval_count ?? 0,
            totalTokens: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
        };
    }

    /**
     * Estimate usage when not provided
     */
    private estimateUsage(request: ChatRequest, output: string): TokenUsage {
        // Rough estimation: ~4 chars per token
        const inputTokens = Math.ceil(
            request.messages.reduce((acc, m) => acc + m.content.length, 0) / 4
        );
        const outputTokens = Math.ceil(output.length / 4);

        return {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
        };
    }

    /**
     * Estimate embedding usage
     */
    private estimateEmbeddingUsage(texts: string[]): TokenUsage {
        // Rough estimation: ~4 chars per token
        const inputTokens = Math.ceil(
            texts.reduce((acc, text) => acc + text.length, 0) / 4
        );

        return {
            inputTokens,
            outputTokens: 0, // Embeddings don't have output tokens
            totalTokens: inputTokens,
        };
    }
}