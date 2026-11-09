// app/analytics/_lib/hooks/finished-answer.ts

import type { AnalyticsDataBlock, ChatMessage } from './useAnalyticsChat';

/** What the stream gathered for the answer by the time it sent 'done' */
export interface StreamedAnswer {
  content: string;
  toolsUsed: string[];
  analyticsData: AnalyticsDataBlock[];
  suggestedFollowUps: string[];
  dataStatus?: ChatMessage['dataStatus'];
}

/**
 * The streamed answer once its stream is done. A failed answer keeps its error text:
 * the server sends 'done' after 'error', with nothing streamed.
 */
export function finishedAnswer(message: ChatMessage, streamed: StreamedAnswer): ChatMessage {
  return {
    ...message,
    content: message.error ? message.content : withoutFollowUps(streamed.content, streamed.suggestedFollowUps),
    isStreaming: false,
    toolsUsed: streamed.toolsUsed,
    analyticsData: streamed.analyticsData.length > 0 ? streamed.analyticsData : undefined,
    suggestedFollowUps: streamed.suggestedFollowUps.length > 0 ? streamed.suggestedFollowUps : undefined,
    dataStatus: streamed.dataStatus,
  };
}

/** The answer text without its trailing follow-up lines, which show as chips instead */
function withoutFollowUps(content: string, followUps: string[]): string {
  if (followUps.length === 0) return content;
  const lines = content.split('\n');
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (last === '' || (last.startsWith('- ') && followUps.includes(last.slice(2).trim()))) lines.pop();
    else break;
  }
  return lines.join('\n');
}
