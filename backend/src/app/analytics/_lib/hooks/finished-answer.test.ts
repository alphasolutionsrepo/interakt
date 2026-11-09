// app/analytics/_lib/hooks/finished-answer.test.ts

/**
 * The analytics answer when its stream sends 'done': a failed turn sends 'error' and
 * then 'done' with nothing streamed, and the answer must keep the error's text.
 */

import { describe, expect, it } from 'vitest';

import { finishedAnswer, type StreamedAnswer } from './finished-answer';
import type { ChatMessage } from './useAnalyticsChat';

const streaming: ChatMessage = { id: 'm1', role: 'assistant', content: '', timestamp: new Date(), isStreaming: true };
const nothingStreamed: StreamedAnswer = { content: '', toolsUsed: [], analyticsData: [], suggestedFollowUps: [] };

describe('finishedAnswer', () => {
    it("keeps a failed answer's error text and error state when 'done' follows 'error'", () => {
        // What the 'error' event left on the message
        const failed: ChatMessage = { ...streaming, content: 'Ollama couldn\'t be reached.', isStreaming: false, error: true };

        expect(finishedAnswer(failed, nothingStreamed)).toMatchObject({
            content: 'Ollama couldn\'t be reached.',
            error: true,
            isStreaming: false,
        });
    });

    it('shows the streamed text without the follow-up lines, which show as chips', () => {
        const done = finishedAnswer(streaming, {
            ...nothingStreamed,
            content: 'Searches rose 12%.\n\n- What drove it?',
            suggestedFollowUps: ['What drove it?'],
            toolsUsed: ['get_search_volume'],
        });

        expect(done).toMatchObject({
            content: 'Searches rose 12%.',
            isStreaming: false,
            toolsUsed: ['get_search_volume'],
            suggestedFollowUps: ['What drove it?'],
            analyticsData: undefined,
        });
        expect(done.error).toBeUndefined();
    });
});
