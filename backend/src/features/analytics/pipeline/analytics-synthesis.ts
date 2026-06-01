// src/features/analytics/pipeline/analytics-synthesis.ts

/**
 * D3: Result Preparation + Response Synthesis
 *
 * D3a: Trim tool results to control token usage (no AI)
 * D3b: Generate business-focused response text (1 AI call, streaming)
 */

import 'server-only';

import { createLogger } from '@/shared/logger/logger';
import type {
  ModuleResult,
  AnalyticsActionResult,
  AnalyticsSynthesisResult,
  AnalyticsTurnContext,
  SSEEmitter,
  ChatFn,
  StreamChatFn,
} from './analytics-pipeline.types';

const logger = createLogger('analytics-synthesis');

// ============================================================================
// D3a: RESULT PREPARATION (trim for token budget)
// ============================================================================

function prepareResults(actions: AnalyticsActionResult[]): string {
  if (actions.length === 0) return '';

  const sections: string[] = [];

  for (const action of actions) {
    if (!action.result.success || !action.result.data) {
      sections.push(`### ${action.toolSlug}\nError: ${action.result.error || 'No data returned'}`);
      continue;
    }

    // The formatted text from executeAnalyticsTool (result.data is already AI-friendly text)
    let text = typeof action.result.data === 'string'
      ? action.result.data
      : JSON.stringify(action.result.data, null, 2);

    // Cap per-tool result at 2000 chars to control prompt size
    if (text.length > 2000) {
      text = text.slice(0, 1997) + '...';
    }

    sections.push(`### ${action.intent}\n${text}`);
  }

  return sections.join('\n\n');
}

// ============================================================================
// SYNTHESIS SYSTEM PROMPT
// ============================================================================

const SYNTHESIS_PROMPT = `You are an analytics advisor for a business admin. Interpret the tool results below and provide business-meaningful insights.

## Rules
1. Data is auto-displayed in visual cards alongside your text. NEVER list or repeat numbers shown in cards.
2. Provide 2-3 sentences of business insight — focus on what it MEANS, not what it IS.
3. Use business language: "Customers can't find X" not "zero-result rate is 15%".
4. Always mention the time period.
5. If no data or tools failed: explain what happened and suggest actions.
6. End with exactly 2-3 follow-up question suggestions on separate lines, prefixed with "- ".
7. Keep your response concise — no more than 4-5 sentences before follow-ups.`;

// ============================================================================
// D3b: RESPONSE SYNTHESIS (1 AI call, streaming)
// ============================================================================

export async function synthesizeAnalyticsResponse(
  context: AnalyticsTurnContext,
  actions: AnalyticsActionResult[],
  directResponse: boolean,
  emit: SSEEmitter,
  streamChat: StreamChatFn,
  chat: ChatFn
): Promise<ModuleResult<AnalyticsSynthesisResult>> {
  const startTime = Date.now();

  try {
    const messages: Array<{ role: string; content: string }> = [];

    if (directResponse) {
      // No tools were called — just respond conversationally
      messages.push({
        role: 'system',
        content: 'You are a friendly analytics assistant. Respond briefly to the user\'s message. If they\'re greeting you, greet back and suggest what you can help with (search analytics, AI performance, content gaps, cost analysis). Keep it to 2-3 sentences.',
      });
    } else {
      // Build synthesis prompt with trimmed results
      const preparedData = prepareResults(actions);
      const experienceNote = context.experienceId
        ? `You are showing data for a specific experience.`
        : `You are showing data across all experiences.`;

      messages.push({
        role: 'system',
        content: `${SYNTHESIS_PROMPT}\n\n${experienceNote}\n\n## Tool Results\n${preparedData}`,
      });
    }

    // Add user message
    messages.push({ role: 'user', content: context.userMessage });

    // Stream the response
    emit({ type: 'status', message: 'Generating insights...' });

    let responseText = '';
    let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    const generator = streamChat(messages, {
      temperature: 0.4,
      maxTokens: 800,
      feature: 'analytics-synthesis',
      ...(context.providerId && { providerId: context.providerId }),
      ...(context.modelId && { modelId: context.modelId }),
    });

    for await (const chunk of generator) {
      if (chunk.content) {
        responseText += chunk.content;
        emit({ type: 'content', content: chunk.content, done: chunk.done });
      }
      if (chunk.done && chunk.usage) {
        usage = {
          inputTokens: chunk.usage.inputTokens || 0,
          outputTokens: chunk.usage.outputTokens || 0,
          totalTokens: chunk.usage.totalTokens || 0,
        };
      }
    }

    // Extract follow-up suggestions from the response
    const suggestedFollowUps = extractFollowUps(responseText);

    if (suggestedFollowUps.length > 0) {
      emit({
        type: 'response_metadata',
        suggestedFollowUps,
        dataStatus: actions.some((a) => a.result.success) ? 'has_data' : 'no_data',
      });
    }

    return {
      success: true,
      data: { responseText, suggestedFollowUps },
      summary: `Synthesized ${responseText.length} chars, ${suggestedFollowUps.length} follow-ups`,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Synthesis failed', { error });
    return {
      success: false,
      summary: `Synthesis failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      durationMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function extractFollowUps(text: string): string[] {
  // Look for lines starting with "- " near the end of the response
  const lines = text.split('\n');
  const followUps: string[] = [];

  // Scan from the end looking for bullet points
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 8); i--) {
    const line = lines[i].trim();
    if (line.startsWith('- ') && line.length > 5) {
      followUps.unshift(line.slice(2).trim());
    }
  }

  return followUps.slice(0, 3);
}
