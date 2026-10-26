// src/features/analytics/analytics-ai-tools.comparisons-text.test.ts

/**
 * What the analytics chat reads from the comparison and usage tools: both
 * periods named, each change with its values, rates in points, and figures
 * that can't be compared said so rather than shown as a change.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/index', () => ({ analyticsDB: null }));

import {
  formatAIUsageForAI,
  formatExperienceComparisonForAI,
  formatPeriodComparisonForAI,
  type PeriodComparison,
} from './analytics-ai-tools';

const overview = (totalSearches: number, zeroResultRate: number, avgSearchDurationMs: number) => ({
  totalSearches,
  totalAIRequests: 0,
  uniqueQueries: Math.round(totalSearches / 2),
  zeroResultRate,
  avgSearchDurationMs,
  avgAIDurationMs: 0,
  searchesFromToolCalls: false,
  searchesByTrigger: { user: totalSearches, ai_tool: 0, ai_rag: 0, system: 0 },
});
const ai = (totalRequests: number, totalTokens: number, estimatedCostUsd = 0) => ({
  totalRequests,
  totalTokens,
  inputTokens: totalTokens,
  outputTokens: 0,
  estimatedCostUsd,
  avgDurationMs: 900,
  byOperation: { text: 0, chat: totalRequests, embedding: 0 },
});

describe('formatPeriodComparisonForAI', () => {
  it('names both periods and gives each change with its values', () => {
    const text = formatPeriodComparisonForAI({
      current: { label: 'Oct 19 – Oct 25, 2026', overview: overview(112, 0.05, 300), ai: ai(40, 8000) },
      previous: { label: 'Oct 12 – Oct 18, 2026', overview: overview(100, 0.08, 250), ai: ai(50, 8000) },
    } as PeriodComparison);

    expect(text).toContain('Oct 19 – Oct 25, 2026 (current) against Oct 12 – Oct 18, 2026 (previous');
    expect(text).toContain('- Searches: 100 → 112 (+12%)');
    expect(text).toContain('no results: 8.0% → 5.0% (-3.0 points)');
    expect(text).toContain('- AI model calls: 50 → 40 (-20%)');
    expect(text).toContain('- Tokens: 8,000 → 8,000 (no change)');
    expect(text).not.toContain('cost');
  });

  it('does not compare rates when a period had no searches', () => {
    const text = formatPeriodComparisonForAI({
      current: { label: 'This week', overview: overview(20, 0.1, 200), ai: ai(0, 0) },
      previous: { label: 'Last week', overview: overview(0, 0, 0), ai: ai(0, 0) },
    } as PeriodComparison);

    expect(text).toContain('- Searches: 0 → 20 (none in the previous period)');
    expect(text).toContain('no results: not comparable');
  });
});

describe('formatExperienceComparisonForAI', () => {
  it('lists the busiest first, with success rates for chat experiences only', () => {
    const text = formatExperienceComparisonForAI([
      { id: 'a', name: 'Docs search', type: 'search', volume: 80, deleted: false, successRate: 0, zeroResultRate: 0.02, avgLatencyMs: 300 },
      { id: 'b', name: 'Store assistant', type: 'ai', volume: 120, deleted: false, successRate: 0.95, zeroResultRate: 0.1, avgLatencyMs: 2100 },
    ]);

    const lines = text.split('\n');
    expect(lines[1]).toBe('- Store assistant [chat]: 120 conversations, 95.0% of turns succeeded, 10.0% of searches found nothing, 2100ms average');
    expect(lines[2]).toBe('- Docs search [search]: 80 searches, 2.0% of searches found nothing, 300ms average');
  });
});

describe('formatAIUsageForAI', () => {
  it('says when no price is known instead of a zero cost', () => {
    const text = formatAIUsageForAI({
      usage: ai(10, 5000),
      tools: { totalExecutions: 4, successRate: 0.75, avgDurationMs: 120, byTool: { search_products: 3, get_hours: 1 }, byCategory: {} },
    });

    expect(text).toContain('Estimated cost: not available');
    expect(text).toContain('Tool calls: 4, 75.0% without errors');
    expect(text).toContain('Most used tools: search_products 3, get_hours 1');
  });
});
