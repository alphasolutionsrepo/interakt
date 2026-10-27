// src/features/ai-service/ai-service.analytics.source.test.ts

/**
 * AI calls are written in batches after the request, so the source of the request they ran in
 * (an admin test chat, the playground) is read when each call is recorded. What each call was
 * for (its feature) is stored as the caller named it.
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
    await withAnalyticsSource('playground', () => trackUsage(call('provider playground')));
    await trackUsage(call('live'));
    // The source comes from the request, never from the feature's name
    await trackUsage({ ...call('named playground'), feature: 'playground' });
    await flushAnalytics();

    const sources = Object.fromEntries(trackAI.mock.calls.map(([event]) => [event.modelKey, event.source]));
    expect(sources).toEqual({ tested: 'admin_test', 'provider playground': 'playground', live: undefined, 'named playground': undefined });
  });
});

describe('AI usage feature', () => {
  it('stores what each call was for, as the caller named it', async () => {
    trackAI.mockClear();
    await trackUsage({ ...call('indexing'), operation: 'embedding', feature: 'document_indexing' });
    await trackUsage({ ...call('planner'), feature: 'turn-planner' });
    await flushAnalytics();

    const features = Object.fromEntries(trackAI.mock.calls.map(([event]) => [event.modelKey, event.feature]));
    expect(features).toEqual({ indexing: 'document_indexing', planner: 'turn-planner' });
  });
});
