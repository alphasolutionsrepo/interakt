// src/features/ai-service/ai-service.api.handlers.ts

/**
 * AI Service API Handlers
 * 
 * Request validation, service calls, and response formatting
 * for the AI Service playground and API consumers.
 */

import { NextRequest } from 'next/server';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';
import * as aiService from './ai-service.service';
import type { ChatMessage } from './ai-service.types';
import { z } from 'zod';

const logger = createLogger('ai-service-handlers');

// ============================================================================
// VALIDATION SCHEMAS FOR API
// ============================================================================

const textGenerationRequestSchema = z.object({
  prompt: z.string().min(1).max(100000),
  providerId: z.string().uuid().optional(),
  modelId: z.number().int().positive().optional(),
  providerKey: z.string().min(1).max(50).optional(),
  modelKey: z.string().min(1).max(100).optional(),
  systemPrompt: z.string().max(50000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(128000).optional(),
  topP: z.number().min(0).max(1).optional(),
  stopSequences: z.array(z.string()).max(4).optional(),
});

// Chat message with required role and content
const chatMessageApiSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1),
  name: z.string().optional(),
});

const chatRequestBodySchema = z.object({
  messages: z.array(chatMessageApiSchema).min(1),
  providerId: z.string().uuid().optional(),
  modelId: z.number().int().positive().optional(),
  providerKey: z.string().min(1).max(50).optional(),
  modelKey: z.string().min(1).max(100).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(128000).optional(),
  topP: z.number().min(0).max(1).optional(),
  stopSequences: z.array(z.string()).max(4).optional(),
  stream: z.boolean().optional(),
});

const embeddingsRequestSchema = z.object({
  texts: z.array(z.string().min(1)).min(1).max(100),
  providerId: z.string().uuid().optional(),
  modelId: z.number().int().positive().optional(),
  providerKey: z.string().min(1).max(50).optional(),
  modelKey: z.string().min(1).max(100).optional(),
  dimensions: z.number().int().positive().optional(),
});

// ============================================================================
// TEXT GENERATION HANDLER
// ============================================================================

/**
 * POST /api/ai-service/text
 * Generate text from a prompt
 */
export async function handleTextGeneration(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const body = await request.json();
    const validation = textGenerationRequestSchema.safeParse(body);

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const { prompt, ...options } = validation.data;

    const startTime = Date.now();
    const result = await aiService.generateText(prompt, {
      ...options,
      userId,
      feature: 'playground',
    });
    const duration = Date.now() - startTime;

    logger.info('Text generation completed via API', {
      requestId: result.metadata.requestId,
      provider: result.metadata.providerKey,
      model: result.metadata.modelKey,
      tokens: result.usage.totalTokens,
      duration,
      userId,
    });

    return apiResponse.success({
      text: result.text,
      usage: result.usage,
      metadata: {
        requestId: result.metadata.requestId,
        provider: result.metadata.providerKey,
        model: result.metadata.modelKey,
        durationMs: result.metadata.durationMs,
        finishReason: result.finishReason,
      },
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Text generation failed', err);

    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }
    if (err.message.includes('Circuit breaker')) {
      return apiResponse.badRequest(err.message);
    }

    return apiResponse.error(err);
  }
}

// ============================================================================
// CHAT HANDLER (Non-streaming)
// ============================================================================

/**
 * POST /api/ai-service/chat
 * Chat completion (non-streaming)
 */
export async function handleChat(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const body = await request.json();
    const validation = chatRequestBodySchema.safeParse(body);

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const { messages, stream, ...options } = validation.data;

    // If stream is requested, redirect to streaming endpoint
    if (stream) {
      return apiResponse.badRequest('Use /api/ai-service/chat/stream for streaming');
    }

    const startTime = Date.now();
    const result = await aiService.chat(messages as ChatMessage[], {
      ...options,
      userId,
      feature: 'playground',
    });
    const duration = Date.now() - startTime;

    logger.info('Chat completion via API', {
      requestId: result.metadata.requestId,
      provider: result.metadata.providerKey,
      model: result.metadata.modelKey,
      tokens: result.usage.totalTokens,
      duration,
      userId,
    });

    return apiResponse.success({
      message: result.message,
      usage: result.usage,
      metadata: {
        requestId: result.metadata.requestId,
        provider: result.metadata.providerKey,
        model: result.metadata.modelKey,
        durationMs: result.metadata.durationMs,
        finishReason: result.finishReason,
      },
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Chat completion failed', err);

    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }
    if (err.message.includes('Circuit breaker')) {
      return apiResponse.badRequest(err.message);
    }

    return apiResponse.error(err);
  }
}

// ============================================================================
// CHAT STREAM HANDLER
// ============================================================================

/**
 * POST /api/ai-service/chat/stream
 * Chat completion with streaming (Server-Sent Events)
 */
export async function handleChatStream(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const validation = chatRequestBodySchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({
        error: 'Validation failed',
        details: validation.error.errors,
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { messages, ...options } = validation.data;

    // Create a ReadableStream for SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const generator = aiService.streamChat(messages as ChatMessage[], {
            ...options,
            userId,
            feature: 'playground',
          });

          for await (const chunk of generator) {
            const data = JSON.stringify({
              content: chunk.content,
              done: chunk.done,
              usage: chunk.usage,
              metadata: chunk.metadata,
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          const err = error as Error;
          logger.error('Chat stream error', err);
          const errorData = JSON.stringify({ error: err.message });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Chat stream setup failed', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ============================================================================
// EMBEDDINGS HANDLER
// ============================================================================

/**
 * POST /api/ai-service/embeddings
 * Generate embeddings for texts
 */
export async function handleEmbeddings(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    const body = await request.json();
    const validation = embeddingsRequestSchema.safeParse(body);

    if (!validation.success) {
      return apiResponse.validationError(validation.error);
    }

    const { texts, ...options } = validation.data;

    const startTime = Date.now();
    const result = await aiService.generateEmbeddings(texts, {
      ...options,
      userId,
      feature: 'playground',
    });
    const duration = Date.now() - startTime;

    logger.info('Embeddings generated via API', {
      requestId: result.metadata.requestId,
      provider: result.metadata.providerKey,
      model: result.metadata.modelKey,
      textCount: texts.length,
      tokens: result.usage.totalTokens,
      duration,
      userId,
    });

    return apiResponse.success({
      embeddings: result.embeddings.map(e => ({
        index: e.index,
        vector: e.vector,
        dimensions: e.vector.length,
      })),
      usage: result.usage,
      metadata: {
        requestId: result.metadata.requestId,
        provider: result.metadata.providerKey,
        model: result.metadata.modelKey,
        durationMs: result.metadata.durationMs,
        dimensions: result.metadata.dimensions,
        batchSize: result.metadata.batchSize,
      },
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Embeddings generation failed', err);

    if (err.message.includes('not found')) {
      return apiResponse.notFound(err.message);
    }
    if (err.message.includes('Circuit breaker')) {
      return apiResponse.badRequest(err.message);
    }

    return apiResponse.error(err);
  }
}

// ============================================================================
// PROVIDERS LIST HANDLER
// ============================================================================

/**
 * GET /api/ai-service/providers
 * Get available providers and models for the playground
 */
export async function handleGetProviders(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return apiResponse.unauthorized('You must be logged in');
    }

    // Import dynamically to avoid circular dependencies
    const { getEnabledProviders, getSystemDefaults } = await import(
      '@/features/ai-providers/ai-providers.service'
    );

    const [providers, defaults] = await Promise.all([
      getEnabledProviders(),
      getSystemDefaults(),
    ]);

    // Transform for playground use
    const result = {
      providers: providers.map(p => ({
        id: p.id,
        key: p.providerKey,
        name: p.displayName,
        type: p.providerType,
        isEnabled: p.isEnabled,
        models: p.models?.filter(m => m.isAvailable).map(m => ({
          id: m.id,
          key: m.modelKey,
          name: m.displayName,
          type: m.modelType,
          contextWindow: m.capabilities?.contextWindow,
          supportsStreaming: m.capabilities?.supportsStreaming,
        })) || [],
      })),
      defaults: {
        textGeneration: defaults?.defaultTextProviderId ? {
          providerId: defaults.defaultTextProviderId,
          modelId: defaults.defaultTextModelId,
        } : null,
        embedding: defaults?.defaultEmbeddingProviderId ? {
          providerId: defaults.defaultEmbeddingProviderId,
          modelId: defaults.defaultEmbeddingModelId,
        } : null,
        chat: defaults?.defaultChatProviderId ? {
          providerId: defaults.defaultChatProviderId,
          modelId: defaults.defaultChatModelId,
        } : null,
      },
    };

    return apiResponse.success(result);
  } catch (error) {
    logger.error('Failed to get providers', error as Error);
    return apiResponse.error(error as Error);
  }
}