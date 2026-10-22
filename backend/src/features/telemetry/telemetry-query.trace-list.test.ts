// src/features/telemetry/telemetry-query.trace-list.test.ts

/**
 * The Traces list tells traces apart by facts from the model calls inside each
 * trace: the models and the tokens. Runs the list query on real Postgres (PGlite)
 * with the analytics migrations applied.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

let testDb: AnalyticsTestDb;
vi.mock('@/db/index', () => ({
  get analyticsDB() {
    return testDb.db;
  },
}));

import { otelSpans } from '@/db/analytics-schema';

import { ATTR } from './attribute-keys';
import { getRecentSpans } from './telemetry-query.service';

let spanCount = 0;
function span(traceId: string, operationName: string, attributes: Record<string, unknown>, secondsAgo = 60) {
  const start = new Date(Date.now() - secondsAgo * 1000);
  return {
    traceId,
    spanId: (++spanCount).toString(16).padStart(16, '0'),
    operationName,
    serviceName: 'interakt',
    startTime: start,
    endTime: new Date(start.getTime() + 1000),
    durationMs: 1000,
    attributes,
  };
}

const call = (model: string, tokens: number, operation = 'chat') => ({
  [ATTR.AI_OPERATION]: operation,
  [ATTR.AI_MODEL_KEY]: model,
  [ATTR.AI_TOTAL_TOKENS]: tokens,
});

const listed = async () => {
  const { spans } = await getRecentSpans('1h', { rootOnly: true });
  return Object.fromEntries(spans.map((s) => [s.traceId, s]));
};

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
beforeEach(async () => {
  await testDb.reset();
});
afterAll(async () => {
  await testDb.close();
});

describe('Traces list facts', () => {
  it('adds up the tokens of a chat turn\'s model calls once, not the turn\'s own total again', async () => {
    await testDb.db.insert(otelSpans).values([
      span('turn', 'chat.ai_experience.turn', { [ATTR.AI_TOTAL_TOKENS]: 600 }, 30),
      // The governed pipeline's turn span repeats the total of its calls
      span('turn', 'pipeline.v2.turn', { [ATTR.AI_TOTAL_TOKENS]: 600 }),
      span('turn', 'ai.chat', call('qwen2.5:14b', 100)),
      span('turn', 'ai.chat', call('qwen2.5:14b', 200)),
      span('turn', 'ai.stream_chat', call('qwen2.5:14b', 300)),
      span('turn', 'ai.generate_embeddings', call('qwen3-embedding:4b', 5, 'embedding')),
    ]);

    const row = (await listed()).turn;
    expect(row.totalTokens).toBe(605);
    expect(row.modelKeys).toBe('qwen2.5:14b, qwen3-embedding:4b');
  });

  it('keeps each trace\'s facts to its own spans', async () => {
    await testDb.db.insert(otelSpans).values([
      span('summary', 'search_experience.summary', { [ATTR.SEARCH_RETURNED]: 3 }, 20),
      span('summary', 'ai.stream_chat', call('qwen2.5:14b', 2503)),
      span('cancelled', 'search_experience.summary', { [ATTR.SEARCH_RETURNED]: 10, [ATTR.SUMMARY_CANCELLED]: true }, 10),
      // A cancelled summary's call reports no tokens
      span('cancelled', 'ai.stream_chat', { [ATTR.AI_OPERATION]: 'chat', [ATTR.AI_MODEL_KEY]: 'qwen2.5:14b' }),
      span('search', 'search_experience.search', { [ATTR.SEARCH_RETURNED]: 0 }, 5),
    ]);

    const rows = await listed();
    expect(rows.summary).toMatchObject({ modelKeys: 'qwen2.5:14b', totalTokens: 2503, resultsReturned: 3, cancelled: false });
    expect(rows.cancelled).toMatchObject({ modelKeys: 'qwen2.5:14b', totalTokens: null, resultsReturned: 10, cancelled: true });
    expect(rows.search).toMatchObject({ modelKeys: null, totalTokens: null, resultsReturned: 0 });
  });
});
