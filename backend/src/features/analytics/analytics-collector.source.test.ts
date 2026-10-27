// src/features/analytics/analytics-collector.source.test.ts

/**
 * Where a search came from (an admin test chat, the playground, live traffic) is stored with
 * the search event, so reports that count live traffic (source = 'api') leave the rest out.
 * Runs trackSearch and the flush on real Postgres (PGlite) with the analytics migrations.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

let testDb: AnalyticsTestDb;
vi.mock('@/db/index', () => ({
  get analyticsDB() {
    return testDb.db;
  },
  db: {},
}));
vi.mock('./analytics-config', () => ({ analyticsFlags: { canTrackSearch: () => true, canTrackAI: () => true } }));
vi.mock('./analytics-retention', () => ({ startRetentionCleanup: vi.fn(), stopRetentionCleanup: vi.fn() }));

import { aiUsageEvents, searchEvents } from '@/db/analytics-schema';

import { clearQueues, forceFlush, stopAnalyticsCollector, trackAI, trackSearch } from './analytics-collector';

function search(queryText: string, source?: 'api' | 'admin_test' | 'playground') {
  trackSearch({
    requestId: crypto.randomUUID(),
    ...(source && { source }),
    triggerType: 'ai_tool',
    searchType: 'lexical',
    indexIds: ['idx'],
    queryText,
    totalResults: 1,
    resultsReturned: 1,
    durationMs: 5,
    success: true,
  });
}

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
beforeEach(async () => {
  clearQueues();
  await testDb.reset();
});
afterAll(async () => {
  await stopAnalyticsCollector();
  await testDb.close();
});

describe('search event source', () => {
  it('stores the source a search was tracked with', async () => {
    search('linen shirt', 'admin_test');
    search('wool coat', 'playground');
    search('denim jacket');
    await forceFlush();

    const rows = await testDb.db.select({ query: searchEvents.queryText, source: searchEvents.source }).from(searchEvents);
    expect(Object.fromEntries(rows.map((r) => [r.query, r.source]))).toEqual({
      'linen shirt': 'admin_test',
      'wool coat': 'playground',
      'denim jacket': 'api',
    });
  });
});

describe('AI usage source', () => {
  it('stores the source an AI call was tracked with', async () => {
    const call = (modelKey: string, source?: 'admin_test' | 'playground') =>
      trackAI({
        requestId: crypto.randomUUID(),
        ...(source && { source }),
        operation: 'chat',
        providerId: crypto.randomUUID(),
        providerKey: 'ollama',
        modelKey,
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        durationMs: 100,
        success: true,
      });
    call('tested', 'admin_test');
    call('playground', 'playground');
    call('live');
    await forceFlush();

    const rows = await testDb.db.select({ model: aiUsageEvents.modelKey, source: aiUsageEvents.source }).from(aiUsageEvents);
    expect(Object.fromEntries(rows.map((r) => [r.model, r.source]))).toEqual({ tested: 'admin_test', playground: 'playground', live: 'api' });
  });
});
