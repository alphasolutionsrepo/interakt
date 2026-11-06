// src/shared/seeders/demo/demo-warmup.failure.test.ts

/**
 * A warm-up step that fails doesn't stop the seed, and its warning carries the error with
 * its causes: the services below pass failures on without logging them.
 */

import { describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('server-only', () => ({}));
const searchDown = vi.hoisted(() => new Error('connect ECONNREFUSED 127.0.0.1:9200'));
const steps = vi.hoisted(() => ({
  chat: { fn: vi.fn(), error: new Error('chat model not found') },
  processing: { fn: vi.fn(), error: new Error('analytics database unreachable') },
  analyticsChat: { fn: vi.fn(), error: new Error('analytics model not found') },
  flush: { fn: vi.fn(), error: new Error('span exporter down') },
}));
vi.mock('@/features/search/search.service', () => ({ searchById: vi.fn(async () => { throw searchDown; }) }));
vi.mock('@/features/search-index/search-index.service', () => ({ getSearchIndexByName: async () => ({ id: 'idx' }) }));
vi.mock('@/features/search-experience/search-experience.service', () => ({ getSearchExperienceBySlug: async () => ({ id: 'exp', slug: 'catalog' }) }));
vi.mock('@/features/ai-experience/ai-experience.service', () => ({ getAIExperienceBySlug: async () => ({ id: 'ai', slug: 'assistant' }) }));
vi.mock('@/features/pipeline/chat-pipeline', () => ({ runChatPipeline: steps.chat.fn }));
vi.mock('@/features/telemetry', () => ({ flushTelemetry: steps.flush.fn }));
vi.mock('@/features/analytics/analytics-processing.service', () => ({ runAnalyticsProcessing: steps.processing.fn }));
vi.mock('@/features/analytics/pipeline/analytics-pipeline-orchestrator', () => ({ runAnalyticsPipeline: steps.analyticsChat.fn }));

import { runWarmup } from './demo-warmup';

describe('a warm-up step that fails', () => {
  const manifest = {
    index: { name: 'catalog' },
    searchExperience: { slug: 'catalog' },
    chatExperience: { slug: 'assistant' },
    warmup: { enabled: true, searches: ['linen shirt'], chats: ['hi'], analyticsChats: ['How many searches?'] },
  };

  it('carries on past a search that fails and warns with the error itself', async () => {
    const summary = await runWarmup({ manifest } as never);

    expect(summary.searchesRun).toBe(0);
    const searchWarning = reported(logs).find((line) => line.message === 'Warm-up search failed (non-fatal)');
    expect(searchWarning?.context).toMatchObject({ query: 'linen shirt', err: searchDown });
  });

  it.each([
    ['a chat turn', 'Warm-up chat turn failed (non-fatal)', steps.chat],
    ['the analytics processing', 'Analytics processing failed (non-fatal)', steps.processing],
    ['an analytics chat turn', 'Warm-up analytics-chat turn failed (non-fatal)', steps.analyticsChat],
    ['the telemetry flush', 'flushTelemetry failed (non-fatal)', steps.flush],
  ])('carries on past %s that fails and warns with the error itself', async (_, message, step) => {
    logs.length = 0;
    step.fn.mockRejectedValueOnce(step.error);
    await runWarmup({ manifest } as never);
    expect(reported(logs).find((line) => line.message === message)?.context).toMatchObject({ err: step.error });
  });
});
