// src/features/analytics/pipeline/analytics-synthesis.ts

/**
 * D3: Result Preparation + Response Synthesis
 *
 * D3a: Trim tool results to control token usage (no AI)
 * D3b: Generate business-focused response text (1 AI call, streaming)
 */

import 'server-only';

import { createLogger } from '@/shared/logger/logger';
import { describePeriod } from '../analytics-period';
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

function formatTimeRange(range: string): string {
  const labels: Record<string, string> = { '1h': 'last hour', '24h': 'last 24 hours', '7d': 'last 7 days', '30d': 'last 30 days' };
  return labels[range] ?? range;
}

/**
 * Tell the model which period the data covers. Uses the range each tool actually read
 * (e.g. precomputed insights only exist for 24h/7d/30d, so a "last hour" request reads
 * 24h data), and calls out when that differs from what was asked for.
 */
export function describeDataPeriods(actions: AnalyticsActionResult[], timeZone: string = 'UTC'): string {
  const notes: string[] = [];
  const covered = new Set<string>();
  for (const action of actions) {
    if (!action.result.success) continue;
    const params = action.parameters ?? {};
    // What was asked for: an exact period, or a fixed range
    const requested =
      typeof params.from === 'string' && typeof params.to === 'string'
        ? describePeriod({ from: new Date(params.from), to: new Date(params.to) }, timeZone)
        : params.timeRange
          ? `the ${formatTimeRange(String(params.timeRange))}`
          : undefined;

    if (action.result.period) {
      // The tool read exactly the requested period
      const exact = describePeriod({ from: new Date(action.result.period.from), to: new Date(action.result.period.to) }, timeZone);
      covered.add(`${action.toolSlug}: ${exact}`);
      continue;
    }
    if (!action.result.timeRange) continue;
    const actual = `the ${formatTimeRange(action.result.timeRange)}`;
    covered.add(`${action.toolSlug}: ${actual}`);
    if (requested && requested !== actual) {
      notes.push(
        `${action.toolSlug} has no data for ${requested}; its results cover ${actual}. Say this explicitly and do not describe these numbers as ${requested}.`,
      );
    }
  }
  if (covered.size === 0) return '';
  return [
    `The data covers (times in ${timeZone}): ${[...covered].join('; ')}. State the period with each figure.`,
    ...notes,
  ].join('\n');
}

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
4. State the period each figure covers, exactly as given under "The data covers". Never describe a figure as covering a different day or period than its tool read.
5. If no data or tools failed: explain what happened and suggest actions.
6. End with exactly 2-3 follow-up question suggestions on separate lines, prefixed with "- ".
7. Keep your response concise — no more than 4-5 sentences before follow-ups.
8. Earlier turns of the conversation come before the latest question. Answer the latest question; read short follow-ups ("why?", "and before that?") as being about the previous answer. Figures in earlier answers are not data: only the tool results below are.`;

/** Earlier turns the answer step sees: the latest few, each cut short so they can't crowd out the data */
const HISTORY_TURNS = 4;
const HISTORY_CHARS = 1200;

export function conversationSoFar(context: AnalyticsTurnContext): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  if (context.conversationSummary) {
    messages.push({ role: 'system', content: `## Earlier in this conversation\n${context.conversationSummary}` });
  }
  for (const msg of context.conversationHistory.slice(-HISTORY_TURNS)) {
    const content = msg.content.length > HISTORY_CHARS ? `${msg.content.slice(0, HISTORY_CHARS)}…` : msg.content;
    messages.push({ role: msg.role, content });
  }
  return messages;
}

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
        ? `All data below is scoped to the experience "${context.experienceName ?? 'selected experience'}" only. Say so when it matters (e.g. "for ${context.experienceName ?? 'this experience'}, ..."), and do not present these numbers as platform-wide.`
        : `You are showing data across all experiences.`;
      const periodNote = describeDataPeriods(actions, context.timeZone);

      messages.push({
        role: 'system',
        content: `${SYNTHESIS_PROMPT}\n\n${experienceNote}\n${periodNote}\n\n## Tool Results\n${preparedData}`,
      });
    }

    // The conversation so far, so a follow-up ("why?", "and the week before?") is read in its light
    messages.push(...conversationSoFar(context));

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
