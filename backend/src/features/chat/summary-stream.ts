// src/features/chat/summary-stream.ts

/**
 * AI summary of search results, as a server-sent event stream.
 *
 * Shared by the public summarize API (/api/v1/summarize) and the admin playground
 * route, so both produce the same summary from the same prompt.
 */

import 'server-only';

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@/shared/logger/logger';
import * as aiService from '@/features/ai-service/ai-service.service';
import type { ChatMessage } from '@/features/ai-service/ai-service.types';
import { ATTR, flushTelemetry, shouldLogContent, withSpan } from '@/features/telemetry';
import type {
  SearchExperienceWithIndexes,
  ChatStreamEvent,
  DocumentReference,
  SummarizeAPIRequest,
} from '@/features/search-experience/search-experience.types';
import { buildSummarySystemPrompt, formatFieldsForContext } from '@/features/chat/prompt-builder';

const logger = createLogger('summary-stream');

// ============================================================================
// SUMMARY STREAM
// ============================================================================

/**
 * Stream an AI summary of caller-supplied search results as SSE events:
 * `sources`, then `content` chunks (`text`), then `done` (usage), then `[DONE]`;
 * an `error` event on failure. Shared by the public summarize API and the admin
 * playground route, so both produce the same summary from the same prompt.
 */
export function createSummaryStream(
  experience: SearchExperienceWithIndexes,
  validated: SummarizeAPIRequest
): ReadableStream<Uint8Array> {
  const summaryConfig = experience.aiConfig.summary;

  // Build the system prompt using prompt builder (Core + Domain + Custom)
  const systemPrompt = buildSummarySystemPrompt({ experience });

  // Build the user prompt with search results
  // Cast validated.results to the expected type - Zod ensures these are present
  // Only the first maxResultsForContext results go to the model (token budget)
  const resultsForPrompt = (validated.results as Array<{
    id: string;
    index: { id: string; name: string };
    fields: Record<string, unknown>;
  }>).slice(0, summaryConfig.maxResultsForContext ?? 10);
  const userPrompt = buildSummaryUserPrompt(
    validated.query,
    resultsForPrompt,
    validated.totalResults,
    validated.instruction
  );

  // Build messages for AI
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // Create streaming response
  const encoder = new TextEncoder();
  return new ReadableStream({
    // One trace per summary (search_experience.summary), with the model call nested
    // in it, so summaries show on the Traces page next to searches and chat turns.
    start: (controller) => withSpan(
      {
        name: 'search_experience.summary',
        experienceId: experience.id,
        attributes: {
          [ATTR.EXPERIENCE_ID]: experience.id,
          [ATTR.EXPERIENCE_TYPE]: 'search',
          [ATTR.EXPERIENCE_SLUG]: experience.slug,
          [ATTR.SEARCH_RETURNED]: resultsForPrompt.length,
          ...(shouldLogContent(experience.id) && { [ATTR.SEARCH_QUERY]: validated.query }),
        },
      },
      () => streamSummary(controller),
    ),
  });

  async function streamSummary(controller: ReadableStreamDefaultController<Uint8Array>) {
    try {
      const maxTokens = summaryConfig.maxTokens ?? 500;
      logger.info('Starting summary generation', {
        experienceId: experience.id,
        providerId: experience.aiConfig.providerId,
        modelId: experience.aiConfig.modelId,
        configuredMaxTokens: summaryConfig.maxTokens,
        effectiveMaxTokens: maxTokens,
      });

      const generator = aiService.streamChat(messages, {
        providerId: experience.aiConfig.providerId ?? undefined,
        modelId: experience.aiConfig.modelId ?? undefined,
        maxTokens,
        temperature: 0.3, // Lower temperature for summaries
        feature: 'search_experience_summary',
        // Links the model call to the experience and applies its trace level
        experienceId: experience.id,
      });

      const sources: DocumentReference[] = resultsForPrompt.map((r) => ({
        id: r.id,
        indexId: r.index.id,
        indexName: r.index.name,
        title: (r.fields.title ?? r.fields.name) as string | undefined,
      }));

      // Send sources event first
      const sourcesEvent: ChatStreamEvent = {
        type: 'sources',
        sources,
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(sourcesEvent)}\n\n`));

      let totalContent = '';

      for await (const chunk of generator) {
        if (chunk.content) {
          totalContent += chunk.content;
          const contentEvent: ChatStreamEvent = {
            type: 'content',
            text: chunk.content,
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(contentEvent)}\n\n`));
        }

        if (chunk.done && chunk.usage) {
          const doneEvent: ChatStreamEvent = {
            type: 'done',
            usage: {
              promptTokens: chunk.usage.inputTokens,
              completionTokens: chunk.usage.outputTokens,
              totalTokens: chunk.usage.totalTokens,
            },
            messageId: uuidv4(),
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`));
        }
      }

      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      await flushTelemetry();
      controller.close();

      logger.info('Summary generated', {
        experienceId: experience.id,
        query: validated.query.substring(0, 50),
        resultCount: validated.results.length,
      });
    } catch (error) {
      logger.error('Summary generation failed', {
        experienceId: experience.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      const errorEvent: ChatStreamEvent = {
        type: 'error',
        error: error instanceof Error ? error.message : 'Failed to generate summary',
        code: 'AI_ERROR',
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
      await flushTelemetry();
      controller.close();
    }
  }
}

// ============================================================================
// PROMPT
// ============================================================================

/**
 * Build user prompt for summary generation
 */
function buildSummaryUserPrompt(
  query: string,
  results: Array<{ id: string; index: { id: string; name: string }; fields: Record<string, unknown> }>,
  totalResults?: number,
  instruction?: string
): string {
  const resultsText = results
    .map((r, i) => {
      const title = r.fields.title || r.fields.name || `Item ${i + 1}`;
      const details = formatFieldsForContext(r.fields);
      return `[${i + 1}] ${title}${details ? `\n${details}` : ''}`;
    })
    .join('\n\n---\n\n');

  let prompt = `Search query: "${query}"

${totalResults ? `Total results found: ${totalResults}` : ''}
Showing top ${results.length} results:

${resultsText}`;

  if (instruction) {
    prompt += `\n\nAdditional instruction: ${instruction}`;
  }

  prompt += '\n\nPlease provide a helpful summary of these search results.';

  return prompt;
}
