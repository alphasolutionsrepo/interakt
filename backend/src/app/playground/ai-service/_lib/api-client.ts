// app/playground/ai-service/_lib/api-client.ts

import { handleApiResponse, toApiError } from '@/shared/api/api-error';
import { streamEvents } from '@/shared/api/stream-events';

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
// AI SERVICE API
// ============================================================================

export const aiServiceApi = {
  /**
   * Get available providers and models
   */
  getProviders: async (): Promise<ProvidersResponse> => {
    const response = await fetch('/api/ai-service/providers');
    return handleApiResponse<ProvidersResponse>(response);
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
    return handleApiResponse<TextGenerationResponse>(response);
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
    return handleApiResponse<ChatResponse>(response);
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

    if (!response.ok) throw await toApiError(response);

    yield* streamEvents<ChatStreamChunk>(response);
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
    return handleApiResponse<EmbeddingsResponse>(response);
  },
};
