// src/features/analytics/analytics-collector.error-scrub.test.ts

/**
 * A failed search, AI call or tool call is stored with its error, without the credentials
 * the error's text can carry (a connection URL with its password, a key in a query
 * string), as the logs leave them out. Runs the collector and its flush on real Postgres
 * (PGlite) with the analytics migrations.
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
vi.mock('./analytics-config', () => ({ analyticsFlags: { canTrackSearch: () => true, canTrackAI: () => true, canTrackTools: () => true } }));
vi.mock('./analytics-retention', () => ({ startRetentionCleanup: vi.fn(), stopRetentionCleanup: vi.fn() }));

import { aiToolExecutions, aiUsageEvents, searchEvents } from '@/db/analytics-schema';

import { clearQueues, forceFlush, stopAnalyticsCollector, trackAI, trackSearch, trackToolExecution } from './analytics-collector';

const leaky = 'connect ECONNREFUSED http://admin:s3cret-pass@es.internal:9200/shop?api_key=k3y-value';

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

describe('a failed event stored in analytics', () => {
  it('keeps the error without the credentials in it, for searches, AI calls and tool calls', async () => {
    // Flushed one kind at a time, as the source tests do
    trackSearch({
      requestId: crypto.randomUUID(), triggerType: 'ai_tool', searchType: 'lexical', indexIds: ['idx'], queryText: 'linen',
      totalResults: 0, resultsReturned: 0, durationMs: 5, success: false, errorMessage: leaky,
    });
    await forceFlush();
    trackAI({
      requestId: crypto.randomUUID(), operation: 'chat', providerId: crypto.randomUUID(), providerKey: 'ollama', modelKey: 'm',
      inputTokens: 0, outputTokens: 0, totalTokens: 0, durationMs: 5, success: false, errorMessage: leaky,
    });
    await forceFlush();
    trackToolExecution({ aiRequestId: crypto.randomUUID(), toolName: 'search', toolCategory: 'retrieval', durationMs: 5, success: false, errorMessage: leaky });
    await forceFlush();

    const stored = [
      ...(await testDb.db.select({ e: searchEvents.errorMessage }).from(searchEvents)),
      ...(await testDb.db.select({ e: aiUsageEvents.errorMessage }).from(aiUsageEvents)),
      ...(await testDb.db.select({ e: aiToolExecutions.errorMessage }).from(aiToolExecutions)),
    ].map((r) => r.e);

    expect(stored).toHaveLength(3);
    for (const message of stored) {
      expect(message).toContain('ECONNREFUSED');
      expect(message).not.toContain('s3cret-pass');
      expect(message).not.toContain('k3y-value');
    }
  });
});
