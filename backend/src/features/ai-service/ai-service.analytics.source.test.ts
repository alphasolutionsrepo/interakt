// src/features/ai-service/ai-service.analytics.source.test.ts

/**
 * AI calls are written in batches after the request, so the source of the request they ran in
 * (an admin test chat, the playground) is read when each call is recorded.
 */

import { describe, expect, it, vi } from 'vitest';

const trackAI = vi.fn();
vi.mock('@/features/analytics', () => ({ trackAI: (...args: unknown[]) => trackAI(...args) }));

import { withAnalyticsSource } from '@/features/analytics/analytics-source-context';

import { flushAnalytics, trackUsage } from './ai-service.analytics';
import type { AIUsageMetrics } from './ai-service.types';

const call = (modelKey: string): AIUsageMetrics => ({
  requestId: crypto.randomUUID(),
  operation: 'chat',
  providerId: 'p1',
  providerKey: 'ollama',
  modelId: 1,
  modelKey,
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
  durationMs: 10,
  success: true,
});

describe('AI usage source', () => {
  it('keeps the source of the request a call ran in, through the later batch write', async () => {
    await withAnalyticsSource('admin_test', () => trackUsage(call('tested')));
    await trackUsage({ ...call('provider playground'), feature: 'playground' });
    await trackUsage(call('live'));
    await flushAnalytics();

    const sources = Object.fromEntries(trackAI.mock.calls.map(([event]) => [event.modelKey, event.source]));
    expect(sources).toEqual({ tested: 'admin_test', 'provider playground': 'playground', live: undefined });
  });
});
