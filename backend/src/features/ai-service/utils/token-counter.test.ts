// src/features/ai-service/utils/token-counter.test.ts

import { describe, expect, it } from 'vitest';

import { estimateChatUsage } from './token-counter';

describe('estimateChatUsage', () => {
  it('counts the prompt with message overhead and the output', () => {
    const usage = estimateChatUsage([{ role: 'user', content: 'Summarize these jackets' }], 'Denim');
    // 23 characters → 6 tokens, + 4 per message + 2 for the conversation; "Denim" → 2
    expect(usage).toEqual({ inputTokens: 12, outputTokens: 2, totalTokens: 14 });
  });

  it('counts the text of text and tool-result blocks, not the number of blocks', () => {
    const usage = estimateChatUsage([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'a'.repeat(40) },
          { type: 'tool_result', tool_use_id: 't1', content: 'b'.repeat(40) },
          { type: 'tool_use', id: 't1', name: 'search', input: { query: 'boots' } },
        ],
      },
    ], '');
    expect(usage).toEqual({ inputTokens: 20 + 4 + 2, outputTokens: 0, totalTokens: 26 });
  });
});
