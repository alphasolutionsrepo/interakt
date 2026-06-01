// src/features/ai-service/index.ts

/**
 * AI Service Feature - Public Exports
 * 
 * Unified AI service for text generation, chat, and embeddings.
 * Supports multiple providers (OpenAI, Ollama) with automatic
 * failover, analytics tracking, and batch processing.
 * 
 * @example
 * import {
 *   generateText,
 *   chat,
 *   streamChat,
 *   generateEmbeddings,
 *   generateEmbedding,
 * } from '@/features/ai-service';
 * 
 * // Text generation
 * const result = await generateText("Explain AI", { temperature: 0.7 });
 * 
 * // Chat completion
 * const response = await chat([
 *   { role: "user", content: "Hello!" }
 * ]);
 * 
 * // Streaming chat
 * for await (const chunk of streamChat(messages)) {
 *   console.log(chunk.content);
 * }
 * 
 * // Embeddings for search
 * const embeddings = await generateEmbeddings(texts);
 */

// ============================================================================
// MAIN SERVICE EXPORTS
// ============================================================================

export {
    // Text generation
    generateText,

    // Chat
    chat,
    streamChat,

    // Embeddings
    generateEmbeddings,
    generateEmbedding,
} from './ai-service.service';

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export {
    // Operations
    AI_OPERATIONS,
    type AIOperation,

    // Common types
    type AIServiceOptions,
    type ResolvedProviderConfig,

    // Text generation
    type TextGenerationOptions,
    type TextGenerationRequest,
    type TextGenerationResult,

    // Chat
    type ChatMessage,
    type ChatMessageRole,
    type ChatOptions,
    type ChatRequest,
    type ChatResult,
    type ChatStreamChunk,

    // Embeddings
    type EmbeddingOptions,
    type EmbeddingRequest,
    type EmbeddingResult,
    type EmbeddingBatchResult,

    // Token usage
    type TokenUsage,

    // Errors
    AIServiceError,
    type AIErrorCode,

    // Analytics
    type AIUsageMetrics,

    // Resilience
    type CircuitState,
    type CircuitBreakerConfig,
    type CircuitBreakerState,
    type RetryConfig,
} from './ai-service.types';

// ============================================================================
// VALIDATION EXPORTS
// ============================================================================

export {
    // Schemas
    aiServiceOptionsSchema,
    textGenerationOptionsSchema,
    textGenerationRequestSchema,
    chatMessageSchema,
    chatMessageRoleSchema,
    chatOptionsSchema,
    chatRequestSchema,
    embeddingOptionsSchema,
    embeddingRequestSchema,
    singleEmbeddingRequestSchema,
    circuitBreakerConfigSchema,
    retryConfigSchema,

    // Types
    type AIServiceOptionsInput,
    type TextGenerationOptionsInput,
    type TextGenerationRequestInput,
    type ChatMessageInput,
    type ChatOptionsInput,
    type ChatRequestInput,
    type EmbeddingOptionsInput,
    type EmbeddingRequestInput,
    type SingleEmbeddingRequestInput,
    type CircuitBreakerConfigInput,
    type RetryConfigInput,

    // Defaults
    AI_SERVICE_DEFAULTS,
    CIRCUIT_BREAKER_DEFAULTS,
    RETRY_DEFAULTS,
} from './ai-service.validation';

// ============================================================================
// ANALYTICS EXPORTS
// ============================================================================

export {
    // Tracking
    trackUsage,
    flushAnalytics,
    stopAnalyticsFlush,

    // Cost estimation
    estimateCost,

    // Real-time metrics
    getRealtimeMetrics,
    resetRealtimeMetrics,
} from './ai-service.analytics';

// ============================================================================
// RESILIENCE EXPORTS
// ============================================================================

export {
    // Circuit breaker
    isCircuitOpen,
    recordSuccess,
    recordFailure,
    getCircuitStatus,
    resetCircuit,
    getAllCircuitStates,

    // Retry
    withRetry,

    // Combined
    withResilience,
    type ResilienceOptions,
} from './ai-service.resilience';

// ============================================================================
// BATCH PROCESSING EXPORTS
// ============================================================================

export {
    processBatches,
    processEmbeddingBatches,
    estimateOptimalBatchSize,
    type BatchProcessorOptions,
    type BatchProgress,
    type BatchResult,
    type EmbeddingBatchOptions,
    type EmbeddingBatchResult as BatchEmbeddingResult,
} from './utils/batch-processor';

// ============================================================================
// ADAPTER EXPORTS (for advanced use cases)
// ============================================================================

export {
    // Factory
    getAdapter,
    isProviderSupported,
    getSupportedProviders,
    registerAdapter,
    clearAdapterCache,

    // Types
    type AIProviderAdapter,
    AdapterError,
} from './adapters';