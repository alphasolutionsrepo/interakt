// src/features/ai-service/ai-service.service.ts

/**
 * AI Service - Unified Entry Point
 * 
 * Provides a single, consistent API for all AI operations.
 * Handles provider resolution, caching, analytics, and resilience.
 * 
 * USAGE:
 * - Use system defaults: generateText("prompt")
 * - Override provider: generateText("prompt", { providerKey: "ollama" })
 * - Override model: generateText("prompt", { providerId: "...", modelId: 123 })
 */

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@/shared/logger/logger';
import {
    getProviderConfigById,
    getProviderByKey,
    getModelById,
    getResolvedDefaults,
} from '@/features/ai-providers/ai-providers.service';
import { getAdapter } from './adapters';
import { withResilience, withRetry } from './ai-service.resilience';
import { trackUsage, updateRealtimeMetrics } from './ai-service.analytics';
import { processEmbeddingBatches } from './utils/batch-processor';
import { AI_SERVICE_DEFAULTS } from './ai-service.validation';
import { traceGenerateText, traceChat as traceChatSpan, traceStreamChat, traceGenerateEmbeddings } from './ai-service.tracing';
import { ATTR } from '@/features/telemetry';
import {
    AIServiceError,
    type TextGenerationOptions,
    type TextGenerationResult,
    type ChatOptions,
    type ChatResult,
    type ChatMessage,
    type ChatStreamChunk,
    type EmbeddingOptions,
    type EmbeddingBatchResult,
    type EmbeddingResult,
    type ResolvedProviderConfig,
    type AdapterConfig,
    type AIUsageMetrics,
} from './ai-service.types';

const logger = createLogger('ai-service');

// ============================================================================
// PROVIDER RESOLUTION
// ============================================================================

/**
 * Resolve provider configuration from options or system defaults
 */
async function resolveProviderConfig(
    operation: 'text' | 'chat' | 'embedding',
    options?: {
        providerId?: string;
        modelId?: number;
        providerKey?: string;
        modelKey?: string;
        timeout?: number;
        maxRetries?: number;
    }
): Promise<ResolvedProviderConfig> {
    let providerId: string | undefined;
    let modelId: number | undefined;

    // Priority: explicit IDs > explicit keys > system defaults
    if (options?.providerId && options?.modelId) {
        providerId = options.providerId;
        modelId = options.modelId;
    } else if (options?.providerKey && options?.modelKey) {
        // Look up by keys
        const provider = await getProviderByKey(options.providerKey);
        if (!provider) {
            throw new AIServiceError(
                `Provider not found: ${options.providerKey}`,
                'PROVIDER_NOT_FOUND',
                undefined,
                options.providerKey
            );
        }
        providerId = provider.id;

        // Find model by key within provider
        // Note: This requires the model to be loaded with provider
        const providerWithModels = await getProviderByKey(options.providerKey);
        if (providerWithModels) {
            // For now, we'll need to look up model separately
            // TODO: Optimize by adding getModelByKey
            throw new AIServiceError(
                'Model lookup by key not yet implemented - use modelId',
                'MODEL_NOT_FOUND'
            );
        }
    } else {
        // Use system defaults
        const defaults = await getResolvedDefaults();

        switch (operation) {
            case 'text':
                providerId = defaults.text.providerId ?? undefined;
                modelId = defaults.text.modelId ?? undefined;
                break;
            case 'chat':
                providerId = defaults.chat.providerId ?? undefined;
                modelId = defaults.chat.modelId ?? undefined;
                break;
            case 'embedding':
                providerId = defaults.embedding.providerId ?? undefined;
                modelId = defaults.embedding.modelId ?? undefined;
                break;
        }
    }

    if (!providerId || !modelId) {
        throw new AIServiceError(
            `No ${operation} provider configured. Set system defaults or provide explicit provider/model.`,
            'PROVIDER_NOT_FOUND'
        );
    }

    // Load provider details (using internal config function to get apiKey)
    const provider = await getProviderConfigById(providerId);
    if (!provider) {
        throw new AIServiceError(
            `Provider not found: ${providerId}`,
            'PROVIDER_NOT_FOUND',
            providerId
        );
    }

    if (!provider.isEnabled) {
        throw new AIServiceError(
            `Provider is disabled: ${provider.providerKey}`,
            'PROVIDER_DISABLED',
            providerId,
            provider.providerKey
        );
    }

    // Load model details
    const model = await getModelById(modelId);
    if (!model) {
        throw new AIServiceError(
            `Model not found: ${modelId}`,
            'MODEL_NOT_FOUND',
            providerId
        );
    }

    // Debug log for capabilities troubleshooting
    logger.debug('Resolved model config', {
        modelId: model.id,
        modelKey: model.modelKey,
        capabilities: model.capabilities,
    });

    return {
        providerId: provider.id,
        providerKey: provider.providerKey,
        modelId: model.id,
        modelKey: model.modelKey,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey ?? undefined,
        timeout: options?.timeout ?? (provider.settings as Record<string, unknown>)?.timeout as number ?? AI_SERVICE_DEFAULTS.timeout,
        maxRetries: options?.maxRetries ?? AI_SERVICE_DEFAULTS.maxRetries,
        settings: provider.settings as Record<string, unknown>,
        capabilities: model.capabilities as Record<string, unknown> ?? {},
    };
}

/**
 * Create adapter config from resolved provider config
 */
function toAdapterConfig(config: ResolvedProviderConfig): AdapterConfig {
    return {
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        modelKey: config.modelKey,
        timeout: config.timeout,
        settings: config.settings,
        capabilities: config.capabilities,
    };
}

// ============================================================================
// TEXT GENERATION
// ============================================================================

/**
 * Generate text using the configured or specified AI provider
 * 
 * @param prompt - The prompt to generate text from
 * @param options - Generation options (provider, model, temperature, etc.)
 * @returns Generated text with usage metadata
 * 
 * @example
 * // Use system defaults
 * const result = await generateText("Explain quantum computing in simple terms");
 * 
 * // Override provider
 * const result = await generateText("Write a poem", {
 *   providerKey: "ollama",
 *   temperature: 0.9,
 * });
 */
export async function generateText(
    prompt: string,
    options?: TextGenerationOptions
): Promise<TextGenerationResult> {
    const requestId = uuidv4();
    const startTime = Date.now();

    let config: ResolvedProviderConfig | undefined;

    try {
        // Resolve provider configuration
        config = await resolveProviderConfig('text', options);

        logger.debug('Generating text', {
            requestId,
            provider: config.providerKey,
            model: config.modelKey,
        });

        // Get adapter
        const adapter = getAdapter(config.providerKey);

        // Execute with resilience (circuit breaker + retry), wrapped in OTel span
        const response = await traceGenerateText(config, async (span) => {
            const result = await withResilience(
                () => adapter.generateText(
                    {
                        prompt,
                        maxTokens: options?.maxTokens,
                        temperature: options?.temperature,
                        topP: options?.topP,
                        stopSequences: options?.stopSequences,
                        systemPrompt: options?.systemPrompt,
                    },
                    toAdapterConfig(config!)
                ),
                {
                    providerId: config!.providerId,
                    retry: { maxRetries: config!.maxRetries },
                }
            );
            span.setAttribute(ATTR.AI_INPUT_TOKENS, result.usage.inputTokens);
            span.setAttribute(ATTR.AI_OUTPUT_TOKENS, result.usage.outputTokens);
            span.setAttribute(ATTR.AI_TOTAL_TOKENS, result.usage.totalTokens);
            return result;
        });

        const durationMs = Date.now() - startTime;

        // Track analytics
        const metrics: AIUsageMetrics = {
            requestId,
            operation: 'text',
            providerId: config.providerId,
            providerKey: config.providerKey,
            modelId: config.modelId,
            modelKey: config.modelKey,
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
            totalTokens: response.usage.totalTokens,
            durationMs,
            success: true,
            userId: options?.userId,
            sessionId: options?.sessionId,
            feature: options?.feature,
            metadata: {
                maxTokens: options?.maxTokens,
                temperature: options?.temperature,
            },
        };
        // Fire-and-forget tracking - no await to avoid blocking
        void trackUsage(metrics);
        updateRealtimeMetrics(metrics);

        return {
            text: response.text,
            usage: response.usage,
            finishReason: response.finishReason,
            metadata: {
                requestId,
                providerId: config.providerId,
                providerKey: config.providerKey,
                modelId: config.modelId,
                modelKey: config.modelKey,
                durationMs,
            },
        };
    } catch (error) {
        const durationMs = Date.now() - startTime;

        // Track failed request
        if (config) {
            const err = error as AIServiceError;
            const metrics: AIUsageMetrics = {
                requestId,
                operation: 'text',
                providerId: config.providerId,
                providerKey: config.providerKey,
                modelId: config.modelId,
                modelKey: config.modelKey,
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                durationMs,
                success: false,
                errorCode: err.code,
                errorMessage: err.message,
                userId: options?.userId,
                sessionId: options?.sessionId,
                feature: options?.feature,
            };
            // Fire-and-forget tracking - no await to avoid blocking
            void trackUsage(metrics);
            updateRealtimeMetrics(metrics);
        }

        logger.error('Text generation failed', error as Error, { requestId });
        throw error;
    }
}

// ============================================================================
// CHAT COMPLETION
// ============================================================================

/**
 * Chat completion (non-streaming)
 * 
 * @param messages - Conversation messages
 * @param options - Chat options
 * @returns Assistant's response with usage metadata
 * 
 * @example
 * const result = await chat([
 *   { role: "system", content: "You are a helpful assistant." },
 *   { role: "user", content: "What is the capital of France?" },
 * ]);
 */
export async function chat(
    messages: ChatMessage[],
    options?: ChatOptions
): Promise<ChatResult> {
    const requestId = uuidv4();
    const startTime = Date.now();

    let config: ResolvedProviderConfig | undefined;

    try {
        config = await resolveProviderConfig('chat', options);

        logger.debug('Chat completion', {
            requestId,
            provider: config.providerKey,
            model: config.modelKey,
            messageCount: messages.length,
        });

        const adapter = getAdapter(config.providerKey);

        const response = await traceChatSpan(
            config,
            { messageCount: messages.length, hasTools: !!options?.tools?.length, experienceId: options?.experienceId, feature: options?.feature, messages },
            async (span) => {
                const result = await withResilience(
                    () => adapter.chat(
                        {
                            messages,
                            maxTokens: options?.maxTokens,
                            temperature: options?.temperature,
                            topP: options?.topP,
                            stopSequences: options?.stopSequences,
                            stream: false,
                            tools: options?.tools,
                            toolChoice: options?.toolChoice,
                            responseFormat: options?.responseFormat,
                        },
                        toAdapterConfig(config!)
                    ),
                    {
                        providerId: config!.providerId,
                        retry: { maxRetries: config!.maxRetries },
                    }
                );
                span.setAttribute(ATTR.AI_INPUT_TOKENS, result.usage.inputTokens);
                span.setAttribute(ATTR.AI_OUTPUT_TOKENS, result.usage.outputTokens);
                span.setAttribute(ATTR.AI_TOTAL_TOKENS, result.usage.totalTokens);
                return result;
            }
        );

        const durationMs = Date.now() - startTime;

        const metrics: AIUsageMetrics = {
            requestId,
            operation: 'chat',
            providerId: config.providerId,
            providerKey: config.providerKey,
            modelId: config.modelId,
            modelKey: config.modelKey,
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
            totalTokens: response.usage.totalTokens,
            durationMs,
            success: true,
            userId: options?.userId,
            sessionId: options?.sessionId,
            feature: options?.feature,
            metadata: {
                messageCount: messages.length,
                maxTokens: options?.maxTokens,
                temperature: options?.temperature,
            },
        };
        void trackUsage(metrics);
        updateRealtimeMetrics(metrics);

        return {
            message: response.message,
            usage: response.usage,
            finishReason: response.finishReason,
            toolCalls: response.toolCalls,
            metadata: {
                requestId,
                providerId: config.providerId,
                providerKey: config.providerKey,
                modelId: config.modelId,
                modelKey: config.modelKey,
                durationMs,
            },
        };
    } catch (error) {
        const durationMs = Date.now() - startTime;

        if (config) {
            const err = error as AIServiceError;
            const metrics: AIUsageMetrics = {
                requestId,
                operation: 'chat',
                providerId: config.providerId,
                providerKey: config.providerKey,
                modelId: config.modelId,
                modelKey: config.modelKey,
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                durationMs,
                success: false,
                errorCode: err.code,
                errorMessage: err.message,
                userId: options?.userId,
                sessionId: options?.sessionId,
                feature: options?.feature,
            };
            void trackUsage(metrics);
            updateRealtimeMetrics(metrics);
        }

        logger.error('Chat completion failed', error as Error, { requestId });
        throw error;
    }
}

/**
 * Stream chat completion
 * 
 * @param messages - Conversation messages
 * @param options - Chat options
 * @returns Async generator yielding response chunks
 * 
 * @example
 * for await (const chunk of streamChat(messages)) {
 *   process.stdout.write(chunk.content);
 *   if (chunk.done) {
 *     console.log("\nTokens used:", chunk.usage?.totalTokens);
 *   }
 * }
 */
export async function* streamChat(
    messages: ChatMessage[],
    options?: ChatOptions
): AsyncGenerator<ChatStreamChunk, void, unknown> {
    const requestId = uuidv4();
    const startTime = Date.now();
    const firstChunkTime = { value: 0 };

    let config: ResolvedProviderConfig | undefined;

    try {
        config = await resolveProviderConfig('chat', options);

        logger.debug('Streaming chat', {
            requestId,
            provider: config.providerKey,
            model: config.modelKey,
            messageCount: messages.length,
            hasTools: !!options?.tools?.length,
            toolNames: options?.tools?.map(t => t.name),
            toolChoice: options?.toolChoice,
        });

        const adapter = getAdapter(config.providerKey);

        // Streaming with OTel tracing — span lives across the generator lifecycle.
        // We retry on connection-establishment errors (i.e. failures *before* the
        // first chunk yields) so transient 5xx / NETWORK_ERROR / RATE_LIMITED on
        // the initial request gets another shot. Once any chunk has yielded we
        // bubble — retrying mid-stream would corrupt the user-visible output.
        const tracedStream = traceStreamChat(
            config,
            { messageCount: messages.length, hasTools: !!options?.tools?.length, messages, experienceId: options?.experienceId },
            async function* () {
                let yielded = false;
                const innerStream = await withRetry(
                    async () => adapter.streamChat(
                        {
                            messages,
                            maxTokens: options?.maxTokens,
                            temperature: options?.temperature,
                            topP: options?.topP,
                            stopSequences: options?.stopSequences,
                            stream: true,
                            tools: options?.tools,
                            toolChoice: options?.toolChoice,
                            responseFormat: options?.responseFormat,
                        },
                        toAdapterConfig(config!)
                    ),
                    { maxRetries: config!.maxRetries },
                );
                try {
                    for await (const chunk of innerStream) {
                        yielded = true;
                        yield chunk;
                    }
                } catch (err) {
                    // If the error fired before any chunk, the connection never
                    // produced output — withRetry above won't catch this case
                    // because adapter.streamChat returns the iterator lazily.
                    // Fall through to a single retry of the whole iteration.
                    if (yielded) throw err;
                    logger.warn('Stream errored before first chunk — retrying once', {
                        provider: config!.providerKey,
                        error: (err as Error).message,
                    });
                    const retryStream = adapter.streamChat(
                        {
                            messages,
                            maxTokens: options?.maxTokens,
                            temperature: options?.temperature,
                            topP: options?.topP,
                            stopSequences: options?.stopSequences,
                            stream: true,
                            tools: options?.tools,
                            toolChoice: options?.toolChoice,
                            responseFormat: options?.responseFormat,
                        },
                        toAdapterConfig(config!)
                    );
                    yield* retryStream;
                }
            }
        );

        let lastChunk: ChatStreamChunk | undefined;

        for await (const chunk of tracedStream) {
            // Track time to first token
            if (firstChunkTime.value === 0 && chunk.content) {
                firstChunkTime.value = Date.now() - startTime;
            }

            // Transform to external format with metadata
            const outputChunk: ChatStreamChunk = {
                content: chunk.content,
                done: chunk.done,
                usage: chunk.usage,
                finishReason: chunk.finishReason,
                toolCalls: chunk.toolCalls,
                metadata: chunk.done ? {
                    requestId,
                    providerId: config!.providerId,
                    providerKey: config!.providerKey,
                    modelId: config!.modelId,
                    modelKey: config!.modelKey,
                    durationMs: Date.now() - startTime,
                    timeToFirstToken: firstChunkTime.value,
                } : undefined,
            };

            lastChunk = outputChunk;
            yield outputChunk;
        }

        // Track analytics on completion
        if (lastChunk?.done && config) {
            const durationMs = Date.now() - startTime;
            const metrics: AIUsageMetrics = {
                requestId,
                operation: 'chat',
                providerId: config.providerId,
                providerKey: config.providerKey,
                modelId: config.modelId,
                modelKey: config.modelKey,
                inputTokens: lastChunk.usage?.inputTokens ?? 0,
                outputTokens: lastChunk.usage?.outputTokens ?? 0,
                totalTokens: lastChunk.usage?.totalTokens ?? 0,
                durationMs,
                timeToFirstToken: firstChunkTime.value,
                success: true,
                userId: options?.userId,
                sessionId: options?.sessionId,
                feature: options?.feature,
                metadata: {
                    streaming: true,
                    messageCount: messages.length,
                },
            };
            void trackUsage(metrics);
            updateRealtimeMetrics(metrics);
        }
    } catch (error) {
        const durationMs = Date.now() - startTime;

        if (config) {
            const err = error as AIServiceError;
            const metrics: AIUsageMetrics = {
                requestId,
                operation: 'chat',
                providerId: config.providerId,
                providerKey: config.providerKey,
                modelId: config.modelId,
                modelKey: config.modelKey,
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                durationMs,
                success: false,
                errorCode: err.code,
                errorMessage: err.message,
                userId: options?.userId,
                sessionId: options?.sessionId,
                feature: options?.feature,
                metadata: { streaming: true },
            };
            void trackUsage(metrics);
            updateRealtimeMetrics(metrics);
        }

        logger.error('Streaming chat failed', error as Error, { requestId });
        throw error;
    }
}

// ============================================================================
// EMBEDDINGS
// ============================================================================

/**
 * Generate embeddings for multiple texts
 * 
 * Automatically handles batching for large requests.
 * 
 * @param texts - Array of texts to embed
 * @param options - Embedding options
 * @returns Embedding results with usage metadata
 * 
 * @example
 * // Embed documents for search indexing
 * const result = await generateEmbeddings(
 *   documents.map(d => d.content),
 *   { feature: 'search_indexing' }
 * );
 * 
 * // Use embeddings
 * documents.forEach((doc, i) => {
 *   doc.embedding = result.embeddings[i].vector;
 * });
 */
export async function generateEmbeddings(
    texts: string[],
    options?: EmbeddingOptions
): Promise<EmbeddingBatchResult> {
    const requestId = uuidv4();
    const startTime = Date.now();

    let config: ResolvedProviderConfig | undefined;

    try {
        config = await resolveProviderConfig('embedding', options);

        const batchSize = options?.batchSize ?? AI_SERVICE_DEFAULTS.embeddingBatchSize;

        logger.debug('Generating embeddings', {
            requestId,
            provider: config.providerKey,
            model: config.modelKey,
            textCount: texts.length,
            batchSize,
        });

        const adapter = getAdapter(config.providerKey);
        const adapterConfig = toAdapterConfig(config);

        // Use batch processor for large requests
        if (texts.length > batchSize) {
            logger.info('Processing embeddings in batches', {
                requestId,
                totalTexts: texts.length,
                batchSize,
                totalBatches: Math.ceil(texts.length / batchSize),
            });
        }

        const batchResult = await traceGenerateEmbeddings(config, async (span) => {
          return processEmbeddingBatches({
            texts,
            batchSize,
            embeddingFn: async (batch) => {
                const response = await withResilience(
                    () => adapter.generateEmbeddings({ texts: batch }, adapterConfig),
                    {
                        providerId: config!.providerId,
                        retry: { maxRetries: config!.maxRetries },
                    }
                );
                return response.embeddings;
            },
            onProgress: (progress) => {
                logger.debug('Embedding progress', {
                    requestId,
                    ...progress,
                });
            },
          });
        }, { feature: options?.feature });

        const durationMs = Date.now() - startTime;

        // Get dimensions from first embedding
        const dimensions = batchResult.embeddings[0]?.length ?? 0;

        // Validate dimensions if expected
        if (options?.dimensions && dimensions !== options.dimensions) {
            logger.warn('Embedding dimensions mismatch', {
                expected: options.dimensions,
                actual: dimensions,
            });
        }

        // Estimate token usage (embeddings don't return exact counts)
        const estimatedTokens = Math.ceil(
            texts.reduce((acc, text) => acc + text.length, 0) / 4
        );

        const metrics: AIUsageMetrics = {
            requestId,
            operation: 'embedding',
            providerId: config.providerId,
            providerKey: config.providerKey,
            modelId: config.modelId,
            modelKey: config.modelKey,
            inputTokens: estimatedTokens,
            outputTokens: 0,
            totalTokens: estimatedTokens,
            durationMs,
            success: true,
            userId: options?.userId,
            sessionId: options?.sessionId,
            feature: options?.feature,
            metadata: {
                batchSize,
                textCount: texts.length,
                dimensions,
            },
        };
        void trackUsage(metrics);
        updateRealtimeMetrics(metrics);

        // Transform to result format
        const embeddings: EmbeddingResult[] = batchResult.embeddings.map((vector, index) => ({
            vector,
            index,
        }));

        return {
            embeddings,
            usage: {
                inputTokens: estimatedTokens,
                outputTokens: 0,
                totalTokens: estimatedTokens,
            },
            metadata: {
                requestId,
                providerId: config.providerId,
                providerKey: config.providerKey,
                modelId: config.modelId,
                modelKey: config.modelKey,
                durationMs,
                batchSize: texts.length,
                dimensions,
            },
        };
    } catch (error) {
        const durationMs = Date.now() - startTime;

        if (config) {
            const err = error as AIServiceError;
            const metrics: AIUsageMetrics = {
                requestId,
                operation: 'embedding',
                providerId: config.providerId,
                providerKey: config.providerKey,
                modelId: config.modelId,
                modelKey: config.modelKey,
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                durationMs,
                success: false,
                errorCode: err.code,
                errorMessage: err.message,
                userId: options?.userId,
                sessionId: options?.sessionId,
                feature: options?.feature,
            };
            void trackUsage(metrics);
            updateRealtimeMetrics(metrics);
        }

        logger.error('Embedding generation failed', error as Error, { requestId });
        throw error;
    }
}

/**
 * Generate embedding for a single text
 * 
 * Convenience wrapper around generateEmbeddings for single texts.
 * 
 * @param text - Text to embed
 * @param options - Embedding options
 * @returns The embedding vector
 * 
 * @example
 * const queryVector = await generateEmbedding("search query");
 */
export async function generateEmbedding(
    text: string,
    options?: EmbeddingOptions
): Promise<number[]> {
    const result = await generateEmbeddings([text], options);
    return result.embeddings[0].vector;
}