// src/features/chat/ai-experience/ai-experience.tracing.ts

/**
 * AI Experience Chat Tracing
 *
 * Thin tracing wrapper for AI experience pipeline turns.
 * Creates a root span around the entire turn, with child spans
 * created automatically by ai-service tracing.
 */

import { SpanKind, type Span } from '@opentelemetry/api';
import { withSpan, shouldLogContent , ATTR } from '@/features/telemetry';

/**
 * Wrap an AI Experience chat turn in a root span.
 */
export function traceAIExperienceTurn<T>(
  options: {
    experienceId: string;
    sessionId: string;
    userMessage: string;
    hasTools: boolean;
  },
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(
    {
      name: 'chat.ai_experience.turn',
      kind: SpanKind.SERVER,
      experienceId: options.experienceId,
      attributes: {
        [ATTR.EXPERIENCE_ID]: options.experienceId,
        [ATTR.EXPERIENCE_TYPE]: 'ai',
        [ATTR.PIPELINE_TYPE]: 'ai_experience',
        [ATTR.CHAT_SESSION_ID]: options.sessionId,
        [ATTR.AI_HAS_TOOLS]: options.hasTools,
        ...(shouldLogContent(options.experienceId) && {
          [ATTR.CHAT_USER_MESSAGE]: options.userMessage.substring(0, 500),
        }),
      },
    },
    fn
  );
}

/**
 * Wrap a tool execution in a child span.
 */
export function traceToolExecution<T>(
  options: {
    experienceId: string;
    toolName: string;
    toolCallId: string;
  },
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(
    {
      name: 'tool.execute',
      kind: SpanKind.INTERNAL,
      experienceId: options.experienceId,
      attributes: {
        [ATTR.TOOL_NAME]: options.toolName,
        [ATTR.EXPERIENCE_ID]: options.experienceId,
      },
    },
    fn
  );
}
