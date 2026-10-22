// src/features/analytics/pipeline/analytics-chat-scope.test.ts

/**
 * Analytics chat stays inside the user's selection: a conversation keeps the
 * experience it started with, tool calls always use the selected experience and
 * time range, and answers describe the period the data actually covers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, executeAnalyticsTool } = vi.hoisted(() => ({
  getSession: vi.fn(),
  executeAnalyticsTool: vi.fn(),
}));

vi.mock('@/db/index', () => ({
  db: {
    select: () => {
      throw new Error('main DB not available in this test');
    },
  },
}));
vi.mock('../analytics-config', () => ({ getAnalyticsConfig: () => ({ analyticsChatWindowSize: 5 }) }));
vi.mock('../admin-chat-session.service', () => ({ getSession }));
vi.mock('../analytics-ai-tools', () => ({ executeAnalyticsTool }));

import { assembleAnalyticsContext } from './analytics-context-assembly';
import { executeAnalyticsTools } from './analytics-execution';
import type { AnalyticsActionResult, AnalyticsTurnPlan } from './analytics-pipeline.types';
import { describeDataPeriods } from './analytics-synthesis';

const EXP_A = '11111111-1111-4111-8111-111111111111';
const EXP_B = '22222222-2222-4222-8222-222222222222';

function session(experienceId: string | null, messageCount = 2) {
  return {
    id: 'session-1',
    experienceId,
    experienceName: experienceId ? 'Experience A' : null,
    messageCount,
    messages: [
      { role: 'user', content: 'How many searches?' },
      { role: 'assistant', content: '42 searches.' },
    ],
    summary: null,
    facts: {},
  };
}

beforeEach(() => {
  getSession.mockReset();
  executeAnalyticsTool.mockReset();
});

describe('conversation scope', () => {
  it('continues a conversation under the experience it started with', async () => {
    getSession.mockResolvedValue(session(EXP_A));
    const result = await assembleAnalyticsContext({ userMessage: 'and yesterday?', sessionId: 'session-1', experienceId: EXP_A });

    expect(result.success).toBe(true);
    expect(result.data?.conversationHistory).toHaveLength(2);
  });

  it('refuses to continue a conversation under a different experience', async () => {
    getSession.mockResolvedValue(session(EXP_A));
    const result = await assembleAnalyticsContext({ userMessage: 'and yesterday?', sessionId: 'session-1', experienceId: EXP_B });

    expect(result.success).toBe(false);
    expect(result.summary).toMatch(/This conversation is about "Experience A"/);
  });

  it('refuses to continue an all-experiences conversation for a single experience', async () => {
    getSession.mockResolvedValue(session(null));
    const result = await assembleAnalyticsContext({ userMessage: 'and yesterday?', sessionId: 'session-1', experienceId: EXP_A });

    expect(result.success).toBe(false);
    expect(result.summary).toMatch(/all experiences/);
  });

  it('lets an empty session take any scope', async () => {
    getSession.mockResolvedValue(session(EXP_A, 0));
    const result = await assembleAnalyticsContext({ userMessage: 'hi', sessionId: 'session-1', experienceId: EXP_B });

    expect(result.success).toBe(true);
  });
});

describe('tool parameters', () => {
  const plan = (hints: Record<string, unknown>): AnalyticsTurnPlan =>
    ({ directResponse: false, actions: [{ toolSlug: 'get_search_overview', intent: 'overview', hints }] }) as unknown as AnalyticsTurnPlan;

  beforeEach(() => {
    executeAnalyticsTool.mockResolvedValue({ success: true, data: 'ok' });
  });

  it('always uses the selected experience, even if the planner chose another', async () => {
    await executeAnalyticsTools(plan({ experienceId: EXP_B }), EXP_A, '30d', vi.fn());
    expect(executeAnalyticsTool).toHaveBeenCalledWith('get_search_overview', expect.objectContaining({ experienceId: EXP_A }));
  });

  it('drops a planner-chosen experience when all experiences are selected', async () => {
    await executeAnalyticsTools(plan({ experienceId: EXP_B }), null, '30d', vi.fn());
    expect(executeAnalyticsTool.mock.calls[0][1]).not.toHaveProperty('experienceId');
  });

  it('defaults to the selected time range, but keeps a period the user asked for', async () => {
    await executeAnalyticsTools(plan({}), EXP_A, '30d', vi.fn());
    expect(executeAnalyticsTool.mock.calls[0][1].timeRange).toBe('30d');

    await executeAnalyticsTools(plan({ timeRange: '24h' }), EXP_A, '30d', vi.fn());
    expect(executeAnalyticsTool.mock.calls[1][1].timeRange).toBe('24h');
  });
});

describe('period the answer describes', () => {
  const action = (requested: string, covered: string | undefined, success = true): AnalyticsActionResult => ({
    toolSlug: 'get_cost_analysis',
    intent: 'cost',
    parameters: { timeRange: requested },
    result: { success, data: 'ok', timeRange: covered },
    durationMs: 1,
  });

  it('describes the period the data covers', () => {
    expect(describeDataPeriods([action('30d', '30d')])).toMatch(/covers: the last 30 days/);
  });

  it('says when a tool read a different period than requested', () => {
    const note = describeDataPeriods([action('1h', '24h')]);
    expect(note).toMatch(/covers: the last 24 hours/);
    expect(note).toMatch(/no data for the last hour/);
    expect(note).not.toMatch(/covers: the last hour/);
  });

  it('adds nothing for results without a period or failed tools', () => {
    expect(describeDataPeriods([action('30d', undefined), action('7d', '7d', false)])).toBe('');
  });
});
