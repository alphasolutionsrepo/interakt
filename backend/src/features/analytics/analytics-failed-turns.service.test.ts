// src/features/analytics/analytics-failed-turns.service.test.ts

/**
 * Failed conversation turns for the analytics chat: a turn failed when it
 * errored or finished without a successful outcome. Counted per reason, newest
 * first, within the period and the selected experience only. Runs on real
 * Postgres (PGlite) with the analytics migrations applied.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

let testDb: AnalyticsTestDb;
vi.mock('@/db/index', () => ({
  get analyticsDB() {
    return testDb.db;
  },
  // Experience names come from the main database, which these tests don't have
  db: null,
}));

import { otelSpans } from '@/db/analytics-schema';

import { ATTR } from '@/features/telemetry/attribute-keys';

import { formatFailedTurnsForAI } from './analytics-ai-tools';
import { getFailedTurns, getTurnsByDay } from './analytics-failed-turns.service';

const chat = crypto.randomUUID();
const other = crypto.randomUUID();
const hex = (n: number) => n.toString(16).padStart(32, '0');

function turn(n: number, at: string, opts: { outcome?: string; error?: string; experienceId?: string } = {}) {
  const start = new Date(at);
  return {
    traceId: hex(n),
    spanId: hex(n).slice(-16),
    operationName: 'pipeline.v2.turn',
    serviceName: 'test',
    startTime: start,
    endTime: new Date(start.getTime() + 1000),
    durationMs: 1000,
    statusCode: opts.error ? 'ERROR' : 'OK',
    statusMessage: opts.error ?? null,
    experienceId: opts.experienceId ?? chat,
    sessionId: `session-${n}`,
    attributes: opts.outcome ? { 'alpha.v2.outcome': opts.outcome } : {},
  };
}

const period = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-10-08T00:00:00Z') };

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
beforeEach(async () => {
  await testDb.reset();
  await testDb.db.insert(otelSpans).values([
    turn(1, '2026-10-02T10:00:00Z', { outcome: 'success' }),
    turn(2, '2026-10-03T10:00:00Z', { outcome: 'plan_failed' }),
    turn(3, '2026-10-04T10:00:00Z', { outcome: 'success', error: 'Provider timed out' }),
    turn(4, '2026-10-05T10:00:00Z', { error: 'Tool crashed' }),
    turn(5, '2026-10-06T10:00:00Z', { outcome: 'plan_failed', experienceId: other }),
    // Outside the period
    turn(6, '2026-09-20T10:00:00Z', { outcome: 'plan_failed' }),
  ]);
});
afterAll(async () => {
  await testDb.close();
});

describe('getFailedTurns', () => {
  it('counts errored and unsuccessful turns by reason, newest first, in the period', async () => {
    const result = await getFailedTurns(period);

    expect(result.totalTurns).toBe(5);
    expect(result.failedTurns).toBe(4);
    // An errored turn counts as an error even when it recorded "success" first
    expect(result.byReason).toEqual({ error: 2, plan_failed: 2 });
    expect(result.recent.map((t) => t.traceId)).toEqual([hex(5), hex(4), hex(3), hex(2)]);
    expect(result.recent[1]).toMatchObject({ error: 'Tool crashed', outcome: null, sessionId: 'session-4' });
  });

  it('keeps to the selected experience', async () => {
    const result = await getFailedTurns(period, other);

    expect(result).toMatchObject({ totalTurns: 1, failedTurns: 1, byReason: { plan_failed: 1 } });
  });

  it('leaves out admin test chats and the playground', async () => {
    const tested = crypto.randomUUID();
    // The pipeline records where a chat came from on the trace's chat turn span, not the pipeline turn
    const source = (n: number, at: string, value: string) => ({
      ...turn(n, at, { experienceId: tested }),
      spanId: hex(n + 100).slice(-16),
      operationName: 'chat.ai_experience.turn',
      attributes: { [ATTR.ANALYTICS_SOURCE]: value },
    });
    await testDb.db.insert(otelSpans).values([
      turn(11, '2026-10-02T10:00:00Z', { outcome: 'plan_failed', experienceId: tested }),
      source(11, '2026-10-02T10:00:00Z', 'api'),
      turn(12, '2026-10-02T11:00:00Z', { outcome: 'plan_failed', experienceId: tested }),
      source(12, '2026-10-02T11:00:00Z', 'admin_test'),
      turn(13, '2026-10-02T12:00:00Z', { outcome: 'plan_failed', experienceId: tested }),
      source(13, '2026-10-02T12:00:00Z', 'playground'),
    ]);

    expect(await getFailedTurns(period, tested)).toMatchObject({ totalTurns: 1, failedTurns: 1, recent: [{ traceId: hex(11) }] });
    expect(await getTurnsByDay(period, 'UTC', tested)).toEqual([{ day: new Date('2026-10-02T00:00:00Z'), turns: 1, failed: 1 }]);
  });

  it('gives the chat the count, the reasons and trace ids to look into', async () => {
    const text = formatFailedTurnsForAI(await getFailedTurns(period), 'UTC');

    expect(text).toContain('4 of 5 conversation turns failed (80.0%)');
    expect(text).toContain('By reason: errored: 2, plan failed: 2.');
    expect(text).toContain(`Oct 5, 10:00: errored: Tool crashed (trace ${hex(4)})`);
  });
});
