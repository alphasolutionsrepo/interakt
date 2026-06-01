// src/features/ai-service/ai-service.tracing.ts

/**
 * AI Service Tracing
 *
 * Thin tracing wrappers for AI service operations.
 * Each wrapper creates a span around the provider call,
 * recording provider, model, tokens, and timing.
 *
 * Content logging (messages, responses) is only recorded when
 * the experience's telemetry detail level is 'full'.
 */

import { SpanKind, type Span } from '@opentelemetry/api';
import { withSpan, withStreamSpan, shouldLogContent , ATTR } from '@/features/telemetry';
import type { ResolvedProviderConfig, ChatStreamChunk, ChatMessage } from './ai-service.types';

/**
 * Wrap a non-streaming chat call in a span.
 */
export function traceChat<T>(
  config: ResolvedProviderConfig,
  options: { messageCount: number; hasTools: boolean; experienceId?: string; feature?: string; messages?: ChatMessage[] },
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const logContent = shouldLogContent(options.experienceId);

  return withSpan<T>(
    {
      name: 'ai.chat',
      kind: SpanKind.CLIENT,
      experienceId: options.experienceId,
      attributes: {
        [ATTR.AI_PROVIDER_KEY]: config.providerKey,
        [ATTR.AI_MODEL_KEY]: config.modelKey,
        [ATTR.AI_OPERATION]: 'chat',
        [ATTR.AI_STREAMING]: false,
        [ATTR.AI_HAS_TOOLS]: options.hasTools,
        ...(options.feature && { 'alpha.ai.feature': options.feature }),
      },
    },
    async (span): Promise<T> => {
      if (logContent && options.messages && options.messages.length > 0) {
        span.addEvent('ai.messages_sent', {
          messages: serializeMessages(options.messages),
          count: options.messages.length,
        });
      }
      return fn(span);
    }
  );
}

const MSG_CONTENT_LIMIT = 6000; // chars per message — long enough for system prompts with tool listings

function serializeMessages(messages: ChatMessage[]): string {
  return JSON.stringify(
    messages.map((m) => ({
      role: m.role,
      content:
        typeof m.content === 'string'
          ? m.content.substring(0, MSG_CONTENT_LIMIT)
          : '[structured content]',
      ...(m.tool_calls ? { tool_calls: m.tool_calls.map((tc) => ({ name: tc.name, input: tc.input })) } : {}),
    }))
  );
}

/**
 * Wrap a streaming chat call in a span.
 * The span lives across the entire generator lifecycle.
 *
 * When detail level is 'full': records messages sent and AI response as span events.
 * When detail level is 'metadata': records only token counts and timing (no message content).
 */
export async function* traceStreamChat(
  config: ResolvedProviderConfig,
  options: { messageCount: number; hasTools: boolean; messages?: ChatMessage[]; experienceId?: string },
  generatorFn: (span: Span) => AsyncGenerator<ChatStreamChunk, void, unknown>
): AsyncGenerator<ChatStreamChunk, void, unknown> {
  const logContent = shouldLogContent(options.experienceId);

  yield* withStreamSpan<ChatStreamChunk>(
    {
      name: 'ai.stream_chat',
      kind: SpanKind.CLIENT,
      attributes: {
        [ATTR.AI_PROVIDER_KEY]: config.providerKey,
        [ATTR.AI_MODEL_KEY]: config.modelKey,
        [ATTR.AI_OPERATION]: 'chat',
        [ATTR.AI_STREAMING]: true,
        [ATTR.AI_HAS_TOOLS]: options.hasTools,
      },
    },
    async function* (span) {
      // Record messages sent to the AI (only when full content logging is enabled)
      if (logContent && options.messages && options.messages.length > 0) {
        span.addEvent('ai.messages_sent', {
          messages: serializeMessages(options.messages),
          count: options.messages.length,
        });
      }

      let firstChunkSeen = false;
      const startMs = Date.now();
      let responseText = '';

      for await (const chunk of generatorFn(span)) {
        if (!firstChunkSeen && chunk.content) {
          firstChunkSeen = true;
          span.setAttribute(ATTR.AI_TIME_TO_FIRST_TOKEN, Date.now() - startMs);
        }
        if (logContent && chunk.content) {
          responseText += chunk.content;
        }
        if (chunk.done) {
          if (chunk.usage) {
            span.setAttribute(ATTR.AI_INPUT_TOKENS, chunk.usage.inputTokens);
            span.setAttribute(ATTR.AI_OUTPUT_TOKENS, chunk.usage.outputTokens);
            span.setAttribute(ATTR.AI_TOTAL_TOKENS, chunk.usage.totalTokens);
          }
          // Record AI response content only when full logging is enabled
          if (logContent) {
            span.addEvent('ai.response', {
              text: responseText.substring(0, MSG_CONTENT_LIMIT),
              tool_calls: chunk.toolCalls
                ? JSON.stringify(chunk.toolCalls.map((tc) => ({ name: tc.name, input: tc.input })))
                : '[]',
            });
          }
        }
        yield chunk;
      }
    }
  );
}

/**
 * Wrap a text generation call in a span.
 */
export function traceGenerateText<T>(
  config: ResolvedProviderConfig,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(
    {
      name: 'ai.generate_text',
      kind: SpanKind.CLIENT,
      attributes: {
        [ATTR.AI_PROVIDER_KEY]: config.providerKey,
        [ATTR.AI_MODEL_KEY]: config.modelKey,
        [ATTR.AI_OPERATION]: 'text',
      },
    },
    fn
  );
}

/**
 * Wrap an embedding call in a span.
 */
export function traceGenerateEmbeddings<T>(
  config: ResolvedProviderConfig,
  fn: (span: Span) => Promise<T>,
  options?: { feature?: string }
): Promise<T> {
  return withSpan(
    {
      name: 'ai.generate_embeddings',
      kind: SpanKind.CLIENT,
      attributes: {
        [ATTR.AI_PROVIDER_KEY]: config.providerKey,
        [ATTR.AI_MODEL_KEY]: config.modelKey,
        [ATTR.AI_OPERATION]: 'embedding',
        ...(options?.feature && { [ATTR.AI_EMBEDDING_FEATURE]: options.feature }),
      },
    },
    fn
  );
}
