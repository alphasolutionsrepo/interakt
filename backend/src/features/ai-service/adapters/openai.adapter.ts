// src/features/ai-service/adapters/openai.adapter.ts

/**
 * OpenAI Adapter
 * 
 * Implements AI provider adapter for OpenAI API.
 * Supports chat completions, text generation, streaming, and embeddings.
 */

import type {
    AdapterConfig,
    AdapterTextResponse,
    AdapterChatResponse,
    AdapterEmbeddingResponse,
    AdapterStreamChunk,
    TextGenerationRequest,
    ChatRequest,
    ChatMessage,
    EmbeddingRequest,
    AIOperation,
    TokenUsage,
    ToolUseBlock,
    ToolResultBlock,
    ToolDefinition,
    ToolParameterSchema,
    ResponseFormat,
} from '../ai-service.types';
import { AIProviderAdapter, AdapterError, parseSSEStream } from './types';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('openai-adapter');

// ============================================================================
// STRICT MODE HELPERS
// ============================================================================

/**
 * Convert a tool parameter schema to OpenAI strict mode format.
 * Strict mode requires:
 * - additionalProperties: false on all objects
 * - All properties listed in required array
 * - Optional fields use type: ["string", "null"] instead of being omitted from required
 *
 * @see https://platform.openai.com/docs/guides/function-calling#strict-mode
 */
function convertToStrictSchema(schema: ToolParameterSchema): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const allPropertyNames = Object.keys(schema.properties);
    const requiredFields = schema.required || [];

    for (const [key, prop] of Object.entries(schema.properties)) {
        const isRequired = requiredFields.includes(key);

        // For optional fields, allow null as an additional type
        if (!isRequired && prop.type !== 'array' && prop.type !== 'object') {
            properties[key] = {
                ...prop,
                type: [prop.type, 'null'],
            };
        } else if (prop.type === 'object' && prop.properties) {
            // Recursively handle nested objects
            properties[key] = convertToStrictSchema({
                type: 'object',
                properties: prop.properties,
                required: prop.required,
            });
        } else if (prop.type === 'array' && prop.items) {
            // Handle arrays with item schemas
            if (prop.items.type === 'object' && prop.items.properties) {
                properties[key] = {
                    ...prop,
                    items: convertToStrictSchema({
                        type: 'object',
                        properties: prop.items.properties,
                        required: prop.items.required,
                    }),
                };
            } else {
                properties[key] = prop;
            }
        } else {
            properties[key] = prop;
        }
    }

    return {
        type: 'object',
        properties,
        required: allPropertyNames, // All properties required in strict mode
        additionalProperties: false,
    };
}

/**
 * Convert tool definitions to OpenAI format with strict mode enabled.
 */
function convertToolsToOpenAI(tools: ToolDefinition[]): OpenAITool[] {
    const openaiTools = tools.map(t => ({
        type: 'function' as const,
        function: {
            name: t.name,
            description: t.description,
            parameters: convertToStrictSchema(t.parameters),
            strict: true,
        },
    }));

    logger.debug('Converted tools to OpenAI strict mode format', {
        toolCount: tools.length,
        toolNames: tools.map(t => t.name),
    });

    return openaiTools;
}

/**
 * Convert our ResponseFormat to OpenAI format.
 */
function convertResponseFormatToOpenAI(responseFormat: ResponseFormat): OpenAIResponseFormat {
    if (responseFormat.type === 'json_schema') {
        return {
            type: 'json_schema',
            json_schema: {
                name: responseFormat.json_schema.name,
                description: responseFormat.json_schema.description,
                strict: responseFormat.json_schema.strict ?? true, // Default to strict mode
                schema: responseFormat.json_schema.schema,
            },
        };
    }
    return responseFormat as OpenAIResponseFormat;
}

// ============================================================================
// OPENAI API TYPES
// ============================================================================

interface OpenAIFunctionCall {
    name: string;
    arguments: string; // JSON string
}

interface OpenAIToolCall {
    id: string;
    type: 'function';
    function: OpenAIFunctionCall;
}

interface OpenAIChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    name?: string;
    tool_calls?: OpenAIToolCall[];
    tool_call_id?: string; // For tool response messages
}

interface OpenAITool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
        strict?: boolean;
    };
}

/**
 * OpenAI response_format for structured outputs
 */
type OpenAIResponseFormat =
    | { type: 'text' }
    | { type: 'json_object' }
    | { type: 'json_schema'; json_schema: { name: string; description?: string; strict?: boolean; schema: Record<string, unknown> } };

interface OpenAIChatRequest {
    model: string;
    messages: OpenAIChatMessage[];
    /** Legacy token limit parameter (GPT-3.5, GPT-4, etc.) */
    max_tokens?: number;
    /** New token limit parameter for newer models (o1, o3, etc.) */
    max_completion_tokens?: number;
    temperature?: number;
    top_p?: number;
    stop?: string[];
    stream?: boolean;
    /** Required for streaming to return usage data (especially for newer models) */
    stream_options?: { include_usage: boolean };
    tools?: OpenAITool[];
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
    /** Response format for structured outputs */
    response_format?: OpenAIResponseFormat;
}

interface OpenAIChatResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: OpenAIChatMessage & { tool_calls?: OpenAIToolCall[] };
        finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

interface OpenAIStreamChunk {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        delta: {
            role?: string;
            content?: string | null;
            tool_calls?: Array<{
                index: number;
                id?: string;
                type?: 'function';
                function?: {
                    name?: string;
                    arguments?: string;
                };
            }>;
        };
        finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

interface OpenAIEmbeddingRequest {
    model: string;
    input: string | string[];
    encoding_format?: 'float' | 'base64';
}

interface OpenAIEmbeddingResponse {
    object: string;
    data: Array<{
        object: string;
        index: number;
        embedding: number[];
    }>;
    model: string;
    usage: {
        prompt_tokens: number;
        total_tokens: number;
    };
}

interface OpenAIErrorResponse {
    error: {
        message: string;
        type: string;
        code: string | null;
    };
}

// ============================================================================
// OPENAI ADAPTER
// ============================================================================

export class OpenAIAdapter implements AIProviderAdapter {
    readonly providerKey = 'openai';
    readonly displayName = 'OpenAI';

    /**
     * Check if operation is supported
     */
    supportsOperation(operation: AIOperation): boolean {
        return ['text', 'chat', 'embedding'].includes(operation);
    }

    /**
     * Generate text using chat completion (OpenAI doesn't have separate text endpoint)
     */
    async generateText(
        request: TextGenerationRequest,
        config: AdapterConfig
    ): Promise<AdapterTextResponse> {
        const messages: OpenAIChatMessage[] = [];

        // Add system prompt if provided
        if (request.systemPrompt) {
            messages.push({ role: 'system', content: request.systemPrompt });
        }

        // Add user prompt
        messages.push({ role: 'user', content: request.prompt });

        const chatRequest: ChatRequest = {
            messages: messages.map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content || '' })),
            maxTokens: request.maxTokens,
            temperature: request.temperature,
            topP: request.topP,
            stopSequences: request.stopSequences,
            stream: false,
        };

        const result = await this.chat(chatRequest, config);

        // Extract text content from the message
        const content = typeof result.message.content === 'string'
            ? result.message.content
            : '';

        return {
            text: content,
            usage: result.usage,
            finishReason: result.finishReason === 'tool_calls' ? 'stop' : result.finishReason,
        };
    }

    /**
     * Chat completion (non-streaming)
     */
    async chat(
        request: ChatRequest,
        config: AdapterConfig
    ): Promise<AdapterChatResponse> {
        // Check model capabilities for newer models (o1, o3, gpt-5, etc.)
        const usesCompletionTokens = config.capabilities?.usesCompletionTokens === true;
        const noTemperature = config.capabilities?.noTemperature === true;

        logger.debug('OpenAI adapter capabilities check', {
            model: config.modelKey,
            capabilities: config.capabilities,
            usesCompletionTokens,
            noTemperature,
            requestTemperature: request.temperature,
            willSkipTemperature: request.temperature !== undefined && noTemperature,
        });

        const openaiRequest: OpenAIChatRequest = {
            model: config.modelKey,
            messages: this.convertMessagesToOpenAI(request.messages),
            // Use max_completion_tokens for newer models, max_tokens for legacy
            ...(request.maxTokens && (usesCompletionTokens
                ? { max_completion_tokens: request.maxTokens }
                : { max_tokens: request.maxTokens }
            )),
            // Skip temperature for models that don't support it (reasoning models)
            ...(request.temperature !== undefined && !noTemperature && { temperature: request.temperature }),
            ...(request.topP !== undefined && !noTemperature && { top_p: request.topP }),
            ...(request.stopSequences?.length && { stop: request.stopSequences }),
            stream: false,
            // Add tools if provided (with strict mode enabled)
            ...(request.tools?.length && {
                tools: convertToolsToOpenAI(request.tools),
            }),
            ...(request.toolChoice && { tool_choice: request.toolChoice }),
            // Add response_format for structured outputs
            ...(request.responseFormat && {
                response_format: convertResponseFormatToOpenAI(request.responseFormat),
            }),
        };

        const response = await this.makeRequest<OpenAIChatResponse>(
            `${config.baseUrl}/chat/completions`,
            openaiRequest,
            config
        );

        const choice = response.choices[0];

        // Convert tool calls if present
        const toolCalls = this.convertToolCallsFromOpenAI(choice.message.tool_calls);

        return {
            message: {
                role: choice.message.role as 'system' | 'user' | 'assistant',
                content: choice.message.content || '',
                ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
            },
            usage: {
                inputTokens: response.usage.prompt_tokens,
                outputTokens: response.usage.completion_tokens,
                totalTokens: response.usage.total_tokens,
            },
            finishReason: this.mapFinishReason(choice.finish_reason),
            ...(toolCalls.length > 0 && { toolCalls }),
        };
    }

    /**
     * Stream chat completion
     */
    async *streamChat(
        request: ChatRequest,
        config: AdapterConfig
    ): AsyncGenerator<AdapterStreamChunk, void, unknown> {
        // Check model capabilities for newer models (o1, o3, gpt-5, etc.)
        const usesCompletionTokens = config.capabilities?.usesCompletionTokens === true;
        const noTemperature = config.capabilities?.noTemperature === true;

        logger.debug('OpenAI adapter capabilities check', {
            model: config.modelKey,
            capabilities: config.capabilities,
            usesCompletionTokens,
            noTemperature,
            requestTemperature: request.temperature,
            willSkipTemperature: request.temperature !== undefined && noTemperature,
        });

        const openaiRequest: OpenAIChatRequest = {
            model: config.modelKey,
            messages: this.convertMessagesToOpenAI(request.messages),
            // Use max_completion_tokens for newer models, max_tokens for legacy
            ...(request.maxTokens && (usesCompletionTokens
                ? { max_completion_tokens: request.maxTokens }
                : { max_tokens: request.maxTokens }
            )),
            // Skip temperature for models that don't support it (reasoning models)
            ...(request.temperature !== undefined && !noTemperature && { temperature: request.temperature }),
            ...(request.topP !== undefined && !noTemperature && { top_p: request.topP }),
            ...(request.stopSequences?.length && { stop: request.stopSequences }),
            stream: true,
            // Required for streaming to return usage data
            stream_options: { include_usage: true },
            // Add tools if provided (with strict mode enabled)
            ...(request.tools?.length && {
                tools: convertToolsToOpenAI(request.tools),
            }),
            ...(request.toolChoice && { tool_choice: request.toolChoice }),
            // Add response_format for structured outputs
            ...(request.responseFormat && {
                response_format: convertResponseFormatToOpenAI(request.responseFormat),
            }),
        };

        logger.debug('Streaming chat request', {
            model: config.modelKey,
            messageCount: request.messages.length,
            hasTools: !!request.tools?.length,
            toolNames: request.tools?.map(t => t.name),
            toolChoice: request.toolChoice,
        });

        const response = await this.makeStreamRequest(
            `${config.baseUrl}/chat/completions`,
            openaiRequest,
            config
        );

        let fullContent = '';
        let finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'error' = 'stop';
        let usage: TokenUsage | undefined;

        // Track tool calls being built up during streaming
        const toolCallsInProgress: Map<number, { id: string; name: string; arguments: string }> = new Map();

        let chunkCount = 0;
        for await (const data of parseSSEStream(response, this.providerKey)) {
            try {
                chunkCount++;
                const chunk: OpenAIStreamChunk = JSON.parse(data);
                const choice = chunk.choices[0];

                // Debug logging for first chunk only
                if (chunkCount === 1) {
                    logger.debug('OpenAI stream started', {
                        model: config.modelKey,
                        hasContent: !!choice?.delta?.content,
                    });
                }

                if (choice?.delta?.content) {
                    fullContent += choice.delta.content;
                    yield {
                        content: choice.delta.content,
                        done: false,
                    };
                }

                // Handle streaming tool calls
                if (choice?.delta?.tool_calls) {
                    for (const toolCallDelta of choice.delta.tool_calls) {
                        const index = toolCallDelta.index;

                        if (!toolCallsInProgress.has(index)) {
                            toolCallsInProgress.set(index, {
                                id: toolCallDelta.id || '',
                                name: toolCallDelta.function?.name || '',
                                arguments: '',
                            });
                        }

                        const toolCall = toolCallsInProgress.get(index)!;

                        if (toolCallDelta.id) {
                            toolCall.id = toolCallDelta.id;
                        }
                        if (toolCallDelta.function?.name) {
                            toolCall.name = toolCallDelta.function.name;
                        }
                        if (toolCallDelta.function?.arguments) {
                            toolCall.arguments += toolCallDelta.function.arguments;
                        }
                    }
                }

                if (choice?.finish_reason) {
                    finishReason = this.mapFinishReason(choice.finish_reason);
                }

                // OpenAI sends usage in the last chunk (if requested)
                if (chunk.usage) {
                    usage = {
                        inputTokens: chunk.usage.prompt_tokens,
                        outputTokens: chunk.usage.completion_tokens,
                        totalTokens: chunk.usage.total_tokens,
                    };
                }
            } catch {
                // Skip invalid JSON chunks
                continue;
            }
        }

        // Convert accumulated tool calls to our format
        const toolCalls: ToolUseBlock[] = [];
        for (const [, toolCall] of toolCallsInProgress) {
            if (toolCall.id && toolCall.name) {
                try {
                    toolCalls.push({
                        type: 'tool_use',
                        id: toolCall.id,
                        name: toolCall.name,
                        input: JSON.parse(toolCall.arguments || '{}'),
                    });
                } catch {
                    // Invalid JSON in arguments, skip this tool call
                }
            }
        }

        // Log streaming summary at debug level
        logger.debug('OpenAI stream completed', {
            model: config.modelKey,
            totalChunks: chunkCount,
            contentLength: fullContent.length,
            finishReason,
        });

        // Final chunk with usage and tool calls
        yield {
            content: '',
            done: true,
            usage: usage ?? this.estimateUsage(request, fullContent),
            finishReason,
            ...(toolCalls.length > 0 && { toolCalls }),
        };
    }

    /**
     * Generate embeddings
     */
    async generateEmbeddings(
        request: EmbeddingRequest,
        config: AdapterConfig
    ): Promise<AdapterEmbeddingResponse> {
        const openaiRequest: OpenAIEmbeddingRequest = {
            model: config.modelKey,
            input: request.texts,
            encoding_format: 'float',
        };

        const response = await this.makeRequest<OpenAIEmbeddingResponse>(
            `${config.baseUrl}/embeddings`,
            openaiRequest,
            config
        );

        // Sort by index to ensure order matches input
        const sortedData = [...response.data].sort((a, b) => a.index - b.index);

        return {
            embeddings: sortedData.map(d => d.embedding),
            usage: {
                inputTokens: response.usage.prompt_tokens,
                outputTokens: 0, // Embeddings don't have output tokens
                totalTokens: response.usage.total_tokens,
            },
            dimensions: sortedData[0]?.embedding.length ?? 0,
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
                headers: this.getHeaders(config),
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
                headers: this.getHeaders(config),
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
     * Get request headers
     */
    private getHeaders(config: AdapterConfig): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (config.apiKey) {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        }

        // Add organization header if specified
        const orgId = config.settings?.organizationId as string | undefined;
        if (orgId) {
            headers['OpenAI-Organization'] = orgId;
        }

        return headers;
    }

    /**
     * Handle error response
     */
    private async handleErrorResponse(response: Response): Promise<never> {
        let errorMessage = `HTTP ${response.status}`;

        try {
            const errorBody: OpenAIErrorResponse = await response.json();
            errorMessage = errorBody.error?.message || errorMessage;
        } catch {
            // Ignore JSON parse errors
        }

        const retryable = response.status === 429 || response.status >= 500;

        throw new AdapterError(
            errorMessage,
            this.providerKey,
            response.status,
            retryable
        );
    }

    /**
     * Map OpenAI finish reason to our format
     */
    private mapFinishReason(
        reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
    ): 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'error' {
        if (!reason) return 'stop';
        return reason;
    }

    /**
     * Estimate usage when not provided (fallback)
     */
    private estimateUsage(request: ChatRequest, output: string): TokenUsage {
        // Rough estimation: ~4 chars per token
        const inputTokens = Math.ceil(
            request.messages.reduce((acc, m) => {
                if (typeof m.content === 'string') {
                    return acc + m.content.length;
                }
                // For array content, estimate based on text blocks
                return acc + m.content.reduce((sum, block) => {
                    if ('text' in block) return sum + block.text.length;
                    if ('content' in block) return sum + block.content.length;
                    return sum;
                }, 0);
            }, 0) / 4
        );
        const outputTokens = Math.ceil(output.length / 4);

        return {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
        };
    }

    /**
     * Convert our ChatMessage format to OpenAI format
     */
    private convertMessagesToOpenAI(messages: ChatMessage[]): OpenAIChatMessage[] {
        return messages.map(m => {
            // Handle tool result messages
            if (m.role === 'tool' && Array.isArray(m.content)) {
                const toolResult = m.content.find(
                    (block): block is ToolResultBlock => 'type' in block && block.type === 'tool_result'
                );
                if (toolResult) {
                    return {
                        role: 'tool' as const,
                        content: toolResult.content,
                        tool_call_id: toolResult.tool_use_id,
                    };
                }
            }

            // Handle assistant messages with tool calls
            if (m.role === 'assistant' && m.tool_calls?.length) {
                return {
                    role: 'assistant' as const,
                    content: typeof m.content === 'string' ? m.content : null,
                    tool_calls: m.tool_calls.map(tc => ({
                        id: tc.id,
                        type: 'function' as const,
                        function: {
                            name: tc.name,
                            arguments: JSON.stringify(tc.input),
                        },
                    })),
                };
            }

            // Regular messages
            const content = typeof m.content === 'string'
                ? m.content
                : m.content.map(block => {
                    if ('text' in block) return block.text;
                    if ('content' in block) return block.content;
                    return '';
                }).join('');

            return {
                role: m.role as 'system' | 'user' | 'assistant',
                content,
                ...(m.name && { name: m.name }),
            };
        });
    }

    /**
     * Convert OpenAI tool calls to our ToolUseBlock format
     */
    private convertToolCallsFromOpenAI(toolCalls?: OpenAIToolCall[]): ToolUseBlock[] {
        if (!toolCalls?.length) return [];

        return toolCalls.map(tc => ({
            type: 'tool_use' as const,
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || '{}'),
        }));
    }
}