// src/features/ai-service/ai-service.types.ts

/**
 * AI Service Feature - Types
 * 
 * Defines all types for the unified AI service layer.
 * Types are organized by operation: text, chat, embedding.
 * 
 * NOTE: Provider/Model configuration types come from ai-providers feature.
 */

// ============================================================================
// OPERATION TYPES (Enum-like constants)
// ============================================================================

export const AI_OPERATIONS = ['text', 'chat', 'embedding'] as const;
export type AIOperation = typeof AI_OPERATIONS[number];

// ============================================================================
// COMMON TYPES
// ============================================================================

/**
 * Options for AI service calls
 * Allows overriding system defaults
 */
export interface AIServiceOptions {
    /** Specific provider ID to use (overrides system default) */
    providerId?: string;
    /** Specific model ID to use (overrides system default) */
    modelId?: number;
    /** Alternative: specify provider by key */
    providerKey?: string;
    /** Alternative: specify model by key */
    modelKey?: string;
    /** Request timeout in milliseconds */
    timeout?: number;
    /** Max retries on failure */
    maxRetries?: number;
    /** User ID for analytics */
    userId?: string;
    /** Session ID for analytics */
    sessionId?: string;
    /** Feature identifier for analytics (e.g., 'search_indexing', 'chat') */
    feature?: string;
    /** Experience ID for per-experience telemetry detail level resolution */
    experienceId?: string;
}

/**
 * Resolved provider configuration
 * Used internally after resolving options
 */
export interface ResolvedProviderConfig {
    providerId: string;
    providerKey: string;
    modelId: number;
    modelKey: string;
    baseUrl: string;
    apiKey?: string;
    timeout: number;
    maxRetries: number;
    settings: Record<string, unknown>;
    /** Model capabilities for adapter-specific behavior */
    capabilities?: Record<string, unknown>;
}

// ============================================================================
// TEXT GENERATION TYPES
// ============================================================================

export interface TextGenerationOptions extends AIServiceOptions {
    /** Maximum tokens to generate */
    maxTokens?: number;
    /** Temperature (0-2, lower = more deterministic) */
    temperature?: number;
    /** Top-p sampling */
    topP?: number;
    /** Stop sequences */
    stopSequences?: string[];
    /** System prompt (prepended to user prompt) */
    systemPrompt?: string;
}

export interface TextGenerationRequest {
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
    systemPrompt?: string;
}

export interface TextGenerationResult {
    text: string;
    usage: TokenUsage;
    finishReason: 'stop' | 'length' | 'content_filter' | 'error';
    metadata: {
        requestId: string;
        providerId: string;
        providerKey: string;
        modelId: number;
        modelKey: string;
        durationMs: number;
    };
}

// ============================================================================
// TOOL TYPES
// ============================================================================

/**
 * JSON Schema property definition for tool parameters
 */
export interface ToolParameterProperty {
    type: string;
    description?: string;
    enum?: string[];
    /** For array types, defines the schema of array items */
    items?: ToolParameterProperty;
    /** For object types, defines nested properties */
    properties?: Record<string, ToolParameterProperty>;
    /** For object types, specifies required properties */
    required?: string[];
}

/**
 * JSON Schema for tool parameters
 */
export interface ToolParameterSchema {
    type: 'object';
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
}

/**
 * Tool definition for AI function calling
 */
export interface ToolDefinition {
    /** Name of the tool (function name) */
    name: string;
    /** Description of what the tool does */
    description: string;
    /** JSON Schema for the tool parameters */
    parameters: ToolParameterSchema;
    /**
     * Operation type — present for data_source tools (search, inspect, enumerate, lookup, query).
     * Used by prompt builders to generate accurate workflow guidance without relying on text matching.
     */
    operation?: string | null;
    /** Executor type — e.g. data_source, http, mcp, ai_call */
    executorType?: string;
    /** FK to the data source this tool operates on (data_source tools only) */
    dataSourceId?: string | null;
}

/**
 * Tool use block returned by AI when it wants to call a tool
 */
export interface ToolUseBlock {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
}

/**
 * Tool result block to send back to AI after executing a tool
 */
export interface ToolResultBlock {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
}

// ============================================================================
// CHAT TYPES
// ============================================================================

export type ChatMessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Content block for messages - can be text or tool use/result
 */
export type MessageContentBlock =
    | { type: 'text'; text: string }
    | ToolUseBlock
    | ToolResultBlock;

export interface ChatMessage {
    role: ChatMessageRole;
    content: string | MessageContentBlock[];
    /** Optional name for multi-user scenarios */
    name?: string;
    /** Tool calls from the assistant (when role is 'assistant') */
    tool_calls?: ToolUseBlock[];
}

/**
 * JSON Schema for structured outputs
 * Used for response_format with type: 'json_schema'
 */
export interface StructuredOutputSchema {
    /** Schema name (for identification) */
    name: string;
    /** Optional description of what the schema is for */
    description?: string;
    /** Whether to enforce strict schema validation */
    strict?: boolean;
    /** The JSON Schema definition */
    schema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
        additionalProperties?: boolean;
    };
}

/**
 * Response format options for structured outputs
 */
export type ResponseFormat =
    | { type: 'text' }
    | { type: 'json_object' }
    | { type: 'json_schema'; json_schema: StructuredOutputSchema };

export interface ChatOptions extends AIServiceOptions {
    /** Maximum tokens to generate */
    maxTokens?: number;
    /** Temperature (0-2) */
    temperature?: number;
    /** Top-p sampling */
    topP?: number;
    /** Stop sequences */
    stopSequences?: string[];
    /** Whether to stream the response */
    stream?: boolean;
    /** Tools available for the AI to use */
    tools?: ToolDefinition[];
    /** Control tool behavior: 'auto', 'none', or force a specific tool */
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
    /** Response format for structured outputs (OpenAI json_schema) */
    responseFormat?: ResponseFormat;
}

export interface ChatRequest {
    messages: ChatMessage[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
    stream?: boolean;
    /** Tools available for the AI to use */
    tools?: ToolDefinition[];
    /** Control tool behavior */
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
    /** Response format for structured outputs */
    responseFormat?: ResponseFormat;
}

export interface ChatResult {
    message: ChatMessage;
    usage: TokenUsage;
    finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'error';
    /** Tool calls requested by the AI (if any) */
    toolCalls?: ToolUseBlock[];
    metadata: {
        requestId: string;
        providerId: string;
        providerKey: string;
        modelId: number;
        modelKey: string;
        durationMs: number;
    };
}

/**
 * Streaming chat chunk
 */
export interface ChatStreamChunk {
    /** Incremental content */
    content: string;
    /** Whether this is the final chunk */
    done: boolean;
    /** Only present on final chunk */
    usage?: TokenUsage;
    /** Only present on final chunk */
    finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'error';
    /** Tool calls in progress (accumulated during streaming) */
    toolCalls?: ToolUseBlock[];
    /** Only present on final chunk */
    metadata?: {
        requestId: string;
        providerId: string;
        providerKey: string;
        modelId: number;
        modelKey: string;
        durationMs: number;
        timeToFirstToken?: number;
    };
}

// ============================================================================
// EMBEDDING TYPES
// ============================================================================

export interface EmbeddingOptions extends AIServiceOptions {
    /** Expected dimensions (for validation) */
    dimensions?: number;
    /** Batch size for processing (default: 100) */
    batchSize?: number;
}

export interface EmbeddingRequest {
    /** Texts to embed */
    texts: string[];
    /** Model to use (resolved from options) */
    model?: string;
}

export interface EmbeddingResult {
    /** The embedding vector */
    vector: number[];
    /** Index in the original batch */
    index: number;
}

export interface EmbeddingBatchResult {
    embeddings: EmbeddingResult[];
    usage: TokenUsage;
    metadata: {
        requestId: string;
        providerId: string;
        providerKey: string;
        modelId: number;
        modelKey: string;
        durationMs: number;
        batchSize: number;
        dimensions: number;
    };
}

// ============================================================================
// TOKEN USAGE
// ============================================================================

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class AIServiceError extends Error {
    constructor(
        message: string,
        public readonly code: AIErrorCode,
        public readonly providerId?: string,
        public readonly providerKey?: string,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'AIServiceError';
    }
}

export type AIErrorCode =
    | 'PROVIDER_NOT_FOUND'
    | 'MODEL_NOT_FOUND'
    | 'PROVIDER_DISABLED'
    | 'PROVIDER_UNAVAILABLE'
    | 'CIRCUIT_OPEN'
    | 'AUTHENTICATION_FAILED'
    | 'RATE_LIMITED'
    | 'CONTEXT_LENGTH_EXCEEDED'
    | 'CONTENT_FILTERED'
    | 'INVALID_REQUEST'
    | 'TIMEOUT'
    | 'NETWORK_ERROR'
    | 'UNKNOWN_ERROR';

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

export interface AIUsageMetrics {
    requestId: string;
    operation: AIOperation;
    providerId: string;
    providerKey: string;
    modelId: number;
    modelKey: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    durationMs: number;
    timeToFirstToken?: number;
    success: boolean;
    errorCode?: AIErrorCode;
    errorMessage?: string;
    userId?: string;
    sessionId?: string;
    feature?: string;
    metadata?: Record<string, unknown>;
}

// ============================================================================
// CIRCUIT BREAKER TYPES
// ============================================================================

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
    /** Number of failures before opening circuit */
    failureThreshold: number;
    /** Time in ms to keep circuit open before trying half-open */
    resetTimeout: number;
    /** Number of successes in half-open to close circuit */
    successThreshold: number;
    /** Time window in ms for counting failures */
    windowSize: number;
}

export interface CircuitBreakerState {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime?: number;
    lastSuccessTime?: number;
    openedAt?: number;
}

// ============================================================================
// RETRY TYPES
// ============================================================================

export interface RetryConfig {
    /** Maximum number of retries */
    maxRetries: number;
    /** Initial delay in ms */
    baseDelay: number;
    /** Maximum delay in ms */
    maxDelay: number;
    /** Multiplier for exponential backoff */
    backoffMultiplier: number;
    /** Add randomness to delay (jitter) */
    jitter: boolean;
}

// ============================================================================
// ADAPTER TYPES (Internal)
// ============================================================================

/**
 * Configuration passed to adapters
 */
export interface AdapterConfig {
    baseUrl: string;
    apiKey?: string;
    modelKey: string;
    timeout: number;
    settings: Record<string, unknown>;
    /** Model capabilities for adapter-specific behavior */
    capabilities?: {
        /** OpenAI: use max_completion_tokens instead of max_tokens */
        usesCompletionTokens?: boolean;
        /** OpenAI: reasoning models don't support temperature parameter */
        noTemperature?: boolean;
        [key: string]: unknown;
    };
}

/**
 * Raw response from adapters (before metadata)
 */
export interface AdapterTextResponse {
    text: string;
    usage: TokenUsage;
    finishReason: 'stop' | 'length' | 'content_filter' | 'error';
}

export interface AdapterChatResponse {
    message: ChatMessage;
    usage: TokenUsage;
    finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'error';
    /** Tool calls requested by the AI */
    toolCalls?: ToolUseBlock[];
}

export interface AdapterEmbeddingResponse {
    embeddings: number[][];
    usage: TokenUsage;
    dimensions: number;
}

export interface AdapterStreamChunk {
    content: string;
    done: boolean;
    usage?: TokenUsage;
    finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'error';
    /** Tool calls accumulated during streaming */
    toolCalls?: ToolUseBlock[];
}