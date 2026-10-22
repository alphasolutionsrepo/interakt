// src/features/analytics/analytics-query.experience-filter.test.ts

/**
 * Per-experience analytics: search counts when experiences share an index, AI and
 * tool usage matched through the experience's traces, and the comparison table
 * agreeing with the overview. Runs the queries on real Postgres (PGlite) with the
 * analytics migrations applied; the main database (experience -> index mapping) is
 * a small fake.
 */

import { getTableName, type SQL } from 'drizzle-orm';
import { PgDialect, type PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

// ----------------------------------------------------------------------------
// Fake main database: answers the experience -> index lookups
// ----------------------------------------------------------------------------

/** search experience id -> index ids */
const experienceIndexes: Record<string, string[]> = {};
const dialect = new PgDialect();

function fakeMainDb() {
  const query = (distinct: boolean) => {
    let table = '';
    let where: SQL | undefined;
    const q = {
      from(t: PgTable) {
        table = getTableName(t);
        return q;
      },
      innerJoin() {
        return q;
      },
      where(cond: SQL) {
        where = cond;
        return q;
      },
      then(resolve: (rows: unknown[]) => void) {
        if (table !== 'search_experience_indexes') return resolve([]);
        if (distinct) return resolve(Object.keys(experienceIndexes).map((id) => ({ id })));
        const experienceId = where ? String(dialect.sqlToQuery(where).params[0]) : '';
        resolve((experienceIndexes[experienceId] ?? []).map((searchIndexId) => ({ searchIndexId })));
      },
    };
    return q;
  };
  return { select: () => query(false), selectDistinct: () => query(true) };
}

let testDb: AnalyticsTestDb;
const mainDb = fakeMainDb();
vi.mock('@/db/index', () => ({
  get analyticsDB() {
    return testDb.db;
  },
  get db() {
    return mainDb;
  },
}));

import { otelSpans, searchEvents } from '@/db/analytics-schema';

import { getExperienceSummaries } from './analytics-experience-summary.service';
import { getAIUsageMetrics, getOverviewMetrics, getToolUsageMetrics } from './analytics-query.service';

// Fresh ids per test file run: the index lookup is cached per experience id
const id = () => crypto.randomUUID();

function searchEvent(experienceId: string | null, indexIds: string[], minutesAgo = 10) {
  return {
    requestId: id(),
    timestamp: new Date(Date.now() - minutesAgo * 60_000),
    source: 'api',
    triggerType: 'user',
    searchType: 'lexical',
    indexIds,
    experienceId,
    queryText: 'shoes',
    queryNormalized: 'shoes',
    queryLength: 5,
    queryWordCount: 1,
    totalResults: 3,
    resultsReturned: 3,
    durationMs: 20,
    success: true,
  };
}

let spanCount = 0;
function span(traceId: string, operationName: string, attributes: Record<string, unknown>, experienceId: string | null = null) {
  const start = new Date(Date.now() - 10 * 60_000);
  return {
    traceId,
    spanId: (++spanCount).toString(16).padStart(16, '0'),
    operationName,
    serviceName: 'interakt',
    startTime: start,
    endTime: new Date(start.getTime() + 500),
    durationMs: 500,
    experienceId,
    attributes,
  };
}

/** One conversation turn: the pipeline span carries the experience, the model and tool spans don't */
function conversation(experienceId: string, tokens: number, tool: string, toolSuccess = true) {
  const traceId = id().replace(/-/g, '');
  return [
    span(traceId, 'pipeline.v2.turn', {}, experienceId),
    span(traceId, 'ai.chat', { 'alpha.ai.operation': 'chat', 'alpha.ai.total_tokens': tokens, 'alpha.ai.input_tokens': tokens - 10, 'alpha.ai.output_tokens': 10 }),
    span(traceId, 'ai.generate_embeddings', { 'alpha.ai.operation': 'embedding' }),
    span(traceId, 'tool.execute', { 'alpha.tool.slug': tool, 'alpha.tool.type': 'data_source:search', 'alpha.tool.success': String(toolSuccess) }),
  ];
}

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
beforeEach(async () => {
  await testDb.reset();
});
afterAll(async () => {
  await testDb.close();
});

describe('search counts for experiences that share an index', () => {
  it('counts tagged events only for their own experience, and untagged events by index', async () => {
    const [a, b, sharedIndex] = [id(), id(), id()];
    experienceIndexes[a] = [sharedIndex];
    experienceIndexes[b] = [sharedIndex];
    await testDb.db.insert(searchEvents).values([
      searchEvent(a, [sharedIndex]),
      searchEvent(a, [sharedIndex]),
      searchEvent(a, [sharedIndex]),
      searchEvent(b, [sharedIndex]),
      searchEvent(b, [sharedIndex]),
      // Older event recorded before experience tagging: belongs to whoever owns the index
      searchEvent(null, [sharedIndex]),
    ]);

    expect((await getOverviewMetrics('24h', a)).totalSearches).toBe(4);
    expect((await getOverviewMetrics('24h', b)).totalSearches).toBe(3);
    expect((await getOverviewMetrics('24h')).totalSearches).toBe(6);
  });

  it('matches only tagged events when the experience has no indexes', async () => {
    const [a, b, index] = [id(), id(), id()];
    experienceIndexes[b] = [index];
    await testDb.db.insert(searchEvents).values([searchEvent(a, [index]), searchEvent(b, [index]), searchEvent(null, [index])]);

    expect((await getOverviewMetrics('24h', a)).totalSearches).toBe(1);
  });
});

describe('AI and tool usage per experience', () => {
  it('counts only the model and tool calls inside the experience’s traces', async () => {
    const [a, b] = [id(), id()];
    await testDb.db.insert(otelSpans).values([
      ...conversation(a, 100, 'catalog-search'),
      ...conversation(a, 50, 'catalog-search', false),
      ...conversation(b, 1000, 'docs-search'),
    ]);

    const aiA = await getAIUsageMetrics('24h', a);
    expect(aiA.totalTokens).toBe(150);
    expect(aiA.inputTokens).toBe(130);
    expect(aiA.outputTokens).toBe(20);
    expect(aiA.totalRequests).toBe(4); // 2 chat + 2 embedding calls
    expect(aiA.byOperation).toEqual({ text: 0, chat: 2, embedding: 2 });

    const toolsA = await getToolUsageMetrics('24h', a);
    expect(toolsA.totalExecutions).toBe(2);
    expect(toolsA.successRate).toBe(0.5);
    expect(toolsA.byTool).toEqual({ 'catalog-search': 2 });

    expect((await getAIUsageMetrics('24h', b)).totalTokens).toBe(1000);
    expect((await getToolUsageMetrics('24h', b)).byTool).toEqual({ 'docs-search': 1 });
  });
});

describe('experience comparison table', () => {
  it('counts the same searches as the overview, including untagged events matched by index', async () => {
    const [a, b, sharedIndex] = [id(), id(), id()];
    experienceIndexes[a] = [sharedIndex];
    experienceIndexes[b] = [sharedIndex];
    await testDb.db.insert(searchEvents).values([
      searchEvent(a, [sharedIndex]),
      searchEvent(b, [sharedIndex]),
      searchEvent(null, [sharedIndex]),
    ]);

    const rows = Object.fromEntries((await getExperienceSummaries('24h')).map((s) => [s.id, s]));

    for (const experienceId of [a, b]) {
      expect(rows[experienceId].volume).toBe((await getOverviewMetrics('24h', experienceId)).totalSearches);
    }
    expect(rows[a].volume).toBe(2);
  });
});
