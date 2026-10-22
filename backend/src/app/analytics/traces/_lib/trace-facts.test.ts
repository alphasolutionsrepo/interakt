// src/app/analytics/traces/_lib/trace-facts.test.ts

import { describe, expect, it } from 'vitest';

import { traceFacts } from './trace-facts';

describe('traceFacts', () => {
  it('shows the model, tokens and results of a summary', () => {
    expect(traceFacts({ modelKeys: 'qwen2.5:14b', totalTokens: 2503, resultsReturned: 3 }))
      .toEqual(['qwen2.5:14b', '2,503 tokens', '3 results']);
  });

  it('leaves out the tokens of a cancelled summary, which has none', () => {
    expect(traceFacts({ modelKeys: 'qwen2.5:14b', totalTokens: null, resultsReturned: 10 }))
      .toEqual(['qwen2.5:14b', '10 results']);
  });

  it('shows a search with no AI calls by its results, including none', () => {
    expect(traceFacts({ modelKeys: null, totalTokens: null, resultsReturned: 1 })).toEqual(['1 result']);
    expect(traceFacts({ modelKeys: null, totalTokens: null, resultsReturned: 0 })).toEqual(['0 results']);
  });

  it('shows nothing when nothing was recorded', () => {
    expect(traceFacts({ modelKeys: null, totalTokens: null, resultsReturned: null })).toEqual([]);
  });
});
