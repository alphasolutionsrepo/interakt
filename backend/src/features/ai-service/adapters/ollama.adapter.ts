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

import { estimateChatUsage } from '../utils/token-counter';
import { withoutUnsupportedReasoning } from './reasoning-fallback';
import { AIProviderAdapter, AdapterError, abortedRequestError, parseNDJSONStream, requestSignal } from './types';


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

/** Ollama's `think`: on/off, or a level for models that take one (gpt-oss). */
type OllamaThink = boolean | 'low' | 'medium' | 'high';

/** The model's configured reasoning effort as Ollama's `think`, when one is set. */
async function thinkOf(config: AdapterConfig): Promise<{ think?: OllamaThink }> {
    const effort = config.capabilities?.reasoningEffort;
    if (effort === 'none') return { think: false };
    // Minimal is as little as possible: off on a model that only turns thinking on or off
    // (deepseek-r1, qwen3), where any level turns it on; low on gpt-oss, which takes levels
    // and ignores off (checked on Ollama 0.40: it reasons more with false than with low)
    if (effort === 'minimal') return { think: (await takesThinkLevels(config)) ? 'low' : false };
    if (effort === 'low') return { think: 'low' };
    if (effort === 'medium' || effort === 'high') return { think: effort };
    return {};
}

/** gpt-oss, as its key or its family ('gpt-oss' or 'gptoss', by Ollama version) names it */
const GPT_OSS = /gpt-?oss/i;

/** Whether a model takes reasoning levels, by Ollama address and model key, and until when that holds */
const takesLevels = new Map<string, { levels: boolean; until: number }>();
/** How long Ollama's answer holds (a name can be copied over another model), and a guess when it couldn't answer */
const FAMILY_TTL_MS = 10 * 60_000;
const GUESS_TTL_MS = 60_000;

/**
 * Whether a model takes reasoning levels (gpt-oss) rather than on/off. Read from the family
 * Ollama reports, which a renamed copy keeps, asked again after a while. When Ollama can't
 * say, the model's key decides for a minute, so requests don't each wait on it.
 */
async function takesThinkLevels(config: AdapterConfig): Promise<boolean> {
    const key = `${config.baseUrl}|${config.modelKey}`;
    const known = takesLevels.get(key);
    if (known && known.until > Date.now()) return known.levels;
    const family = await modelFamily(config);
    const levels = GPT_OSS.test(family ?? config.modelKey);
    takesLevels.set(key, { levels, until: Date.now() + (family === undefined ? GUESS_TTL_MS : FAMILY_TTL_MS) });
    return levels;
}

/** The model's family as Ollama's /api/show reports it, or undefined when it can't say */
async function modelFamily(config: AdapterConfig): Promise<string | undefined> {
    try {
        const response = await fetch(`${config.baseUrl}/api/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: config.modelKey }),
            signal: AbortSignal.timeout(Math.min(config.timeout, 5_000)),
        });
        if (!response.ok) return undefined;
        const { details } = (await response.json()) as { details?: { family?: string; families?: string[] | null } };
        const names = [details?.family, ...(details?.families ?? [])].filter((name): name is string => !!name);
        return names.length > 0 ? names.join(' ') : undefined;
    } catch {
        return undefined;
    }
}

/** What every generation request carries: sampling options, keep-alive and reasoning */
async function generationSettings(
    request: { maxTokens?: number; temperature?: number; topP?: number; stopSequences?: string[] },
    config: AdapterConfig,
) {
    return {
        options: {
            ...(request.maxTokens && { num_predict: request.maxTokens }),
            ...(request.temperature !== undefined && { temperature: request.temperature }),
            ...(request.topP !== undefined && { top_p: request.topP }),
            ...(request.stopSequences?.length && { stop: request.stopSequences }),
        },
        ...(config.settings?.keepAlive && { keep_alive: config.settings.keepAlive as string }),
        ...(await thinkOf(config)),
    };
}

interface OllamaGenerateRequest {
    model: string;
    prompt: string;
    system?: string;
    stream?: boolean;
    think?: OllamaThink;
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
    think?: OllamaThink;
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
            ...(await generationSettings(request, config)),
        };

        const response = await withoutUnsupportedReasoning(ollamaRequest, 'think', (body) => this.makeRequest<OllamaGenerateResponse>(
            `${config.baseUrl}/api/generate`,
            body,
            config
        ));

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
        const ollamaRequest = await this.chatRequest(request, config, false);

        const response = await withoutUnsupportedReasoning(ollamaRequest, 'think', (body) => this.makeRequest<OllamaChatResponse>(
            `${config.baseUrl}/api/chat`,
            body,
            config
        ));

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
        const ollamaRequest = await this.chatRequest(request, config, true);

        const response = await withoutUnsupportedReasoning(ollamaRequest, 'think', (body) => this.makeStreamRequest(
            `${config.baseUrl}/api/chat`,
            body,
            config,
            request.signal
        ));

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
            : estimateChatUsage(request.messages, fullContent, config.modelKey);

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

    /** A chat request as Ollama's /api/chat takes it, streamed or not */
    private async chatRequest(request: ChatRequest, config: AdapterConfig, stream: boolean): Promise<OllamaChatRequest> {
        const format = toOllamaFormat(request.responseFormat);
        return {
            model: config.modelKey,
            messages: this.convertMessages(request.messages),
            stream,
            ...(format && { format }),
            ...(await generationSettings(request, config)),
        };
    }

    /** Make a non-streaming request: its answer, read as JSON */
    private async makeRequest<T>(url: string, body: unknown, config: AdapterConfig): Promise<T> {
        const response = await this.send(url, body, config);
        try {
            return await response.json() as T;
        } catch (error) {
            throw this.requestFailure(error);
        }
    }

    /** Make a streaming request: the response, its body read by the caller */
    private makeStreamRequest(url: string, body: unknown, config: AdapterConfig, signal?: AbortSignal): Promise<Response> {
        return this.send(url, body, config, signal);
    }

    /** POST a request within the configured timeout; an error answer or no answer throws an AdapterError */
    private async send(url: string, body: unknown, config: AdapterConfig, signal?: AbortSignal): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: requestSignal(controller.signal, signal),
            });

            if (!response.ok) {
                await this.handleErrorResponse(response);
            }

            return response;
        } catch (error) {
            throw this.requestFailure(error, signal);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /** A request that failed, as an AdapterError: timed out, cancelled, Ollama not running, the network */
    private requestFailure(error: unknown, signal?: AbortSignal): AdapterError {
        if (error instanceof AdapterError) return error;
        if (error instanceof Error && error.name === 'AbortError') return abortedRequestError(this.providerKey, signal);
        // Check if Ollama is not running
        if ((error as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
            return new AdapterError('Ollama is not running. Please start Ollama and try again.', this.providerKey, undefined, true);
        }
        return new AdapterError(`Network error: ${(error as Error).message}`, this.providerKey, undefined, true, error as Error);
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