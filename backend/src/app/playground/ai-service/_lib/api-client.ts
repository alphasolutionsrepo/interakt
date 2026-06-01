// app/playground/ai-service/_lib/api-client.ts

/**
 * AI Service Playground API Client
 * 
 * Thin wrapper around fetch() for AI service operations.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface AIProvider {
  id: string;
  key: string;
  name: string;
  type: 'cloud' | 'local';
  isEnabled: boolean;
  models: AIModel[];
}

export interface AIModel {
  id: number;
  key: string;
  name: string;
  type: string;
  contextWindow?: number;
  supportsStreaming?: boolean;
}

export interface ProvidersResponse {
  providers: AIProvider[];
  defaults: {
    textGeneration: { providerId: string; modelId: number } | null;
    embedding: { providerId: string; modelId: number } | null;
    chat: { providerId: string; modelId: number } | null;
  };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface TextGenerationRequest {
  prompt: string;
  providerId?: string;
  modelId?: number;
  providerKey?: string;
  modelKey?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
}

export interface TextGenerationResponse {
  text: string;
  usage: TokenUsage;
  metadata: {
    requestId: string;
    provider: string;
    model: string;
    durationMs: number;
    finishReason?: string;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  providerId?: string;
  modelId?: number;
  providerKey?: string;
  modelKey?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  stream?: boolean;
}

export interface ChatResponse {
  message: ChatMessage;
  usage: TokenUsage;
  metadata: {
    requestId: string;
    provider: string;
    model: string;
    durationMs: number;
    finishReason?: string;
  };
}

export interface ChatStreamChunk {
  content: string;
  done: boolean;
  usage?: TokenUsage;
  metadata?: {
    requestId: string;
    provider: string;
    model: string;
    durationMs?: number;
  };
}

export interface EmbeddingsRequest {
  texts: string[];
  providerId?: string;
  modelId?: number;
  providerKey?: string;
  modelKey?: string;
  dimensions?: number;
}

export interface EmbeddingResult {
  index: number;
  vector: number[];
  dimensions: number;
}

export interface EmbeddingsResponse {
  embeddings: EmbeddingResult[];
  usage: TokenUsage;
  metadata: {
    requestId: string;
    provider: string;
    model: string;
    durationMs: number;
    dimensions: number;
    batchSize: number;
  };
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');

  if (!contentType?.includes('application/json')) {
    if (!response.ok) {
      throw new ApiError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }
    return response.text() as unknown as T;
  }

  const json = await response.json();

  if (!response.ok) {
    throw new ApiError(
      json.error || json.message || `HTTP ${response.status}`,
      response.status,
      json.code,
      json.details
    );
  }

  // Handle { success: true, data: {...} } format
  if (json.success !== undefined && json.data !== undefined) {
    return json.data;
  }

  return json;
}

// ============================================================================
// AI SERVICE API
// ============================================================================

export const aiServiceApi = {
  /**
   * Get available providers and models
   */
  getProviders: async (): Promise<ProvidersResponse> => {
    const response = await fetch('/api/ai-service/providers');
    return handleResponse<ProvidersResponse>(response);
  },

  /**
   * Generate text from prompt
   */
  generateText: async (request: TextGenerationRequest): Promise<TextGenerationResponse> => {
    const response = await fetch('/api/ai-service/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return handleResponse<TextGenerationResponse>(response);
  },

  /**
   * Chat completion (non-streaming)
   */
  chat: async (request: ChatRequest): Promise<ChatResponse> => {
    const response = await fetch('/api/ai-service/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return handleResponse<ChatResponse>(response);
  },

  /**
   * Chat completion with streaming (returns async generator)
   */
  chatStream: async function* (
    request: Omit<ChatRequest, 'stream'>
  ): AsyncGenerator<ChatStreamChunk> {
    const response = await fetch('/api/ai-service/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, stream: true }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.error || `HTTP ${response.status}`,
        response.status
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ApiError('No response body', 500);
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            try {
              const chunk = JSON.parse(data) as ChatStreamChunk;
              yield chunk;
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  /**
   * Generate embeddings for texts
   */
  generateEmbeddings: async (request: EmbeddingsRequest): Promise<EmbeddingsResponse> => {
    const response = await fetch('/api/ai-service/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return handleResponse<EmbeddingsResponse>(response);
  },
};