// src/features/analytics/analytics.api.handlers.validation.test.ts

/**
 * A bad analytics parameter answers with the standard validation envelope (our wording, a
 * code per field), not zod's error dumped as JSON text inside the message.
 */

import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/index', () => ({ analyticsDB: null, db: {} }));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));

import {
  handleGetAIUsage,
  handleGetDashboard,
  handleGetInsights,
  handleGetOverview,
  handleGetPerformanceMetrics,
  handleGetPopularQueries,
  handleGetRecentSearches,
  handleGetSearchTrends,
  handleGetSearchTypeBreakdown,
  handleGetToolUsage,
  handleGetZeroResultQueries,
  handleHideFinding,
  handleSetExperienceOverride,
  handleUnhideFinding,
  handleUpdateConfig,
} from './analytics.api.handlers';

const post = (body: unknown) =>
  new NextRequest('http://localhost/api/analytics/x', { method: 'POST', body: JSON.stringify(body) });

describe('analytics handlers: invalid parameters', () => {
  it.each([
    ['overview', handleGetOverview],
    ['popular queries', handleGetPopularQueries],
  ])('%s answers 400 with the standard envelope and a field error, not a raw JSON dump', async (_name, handler) => {
    const res = await handler(new NextRequest('http://localhost/api/analytics/x?timeRange=yesterday'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ success: false, code: 'VALIDATION_ERROR', message: 'Some values are not valid' });
    expect(body.fields).toEqual([
      expect.objectContaining({ field: 'timeRange', code: 'invalid_value', message: expect.stringMatching(/^Choose one of: /) }),
    ]);
    expect(String(body.message)).not.toContain('"code"');
    expect(String(body.error ?? '')).not.toContain('"code"');
    expect(String(body.message)).not.toMatch(/^Invalid parameters/);
  });
});

describe('analytics handlers: every read handler that validates its parameters', () => {
  it.each([
    ['search trends', handleGetSearchTrends],
    ['zero-result queries', handleGetZeroResultQueries],
    ['search type breakdown', handleGetSearchTypeBreakdown],
    ['performance metrics', handleGetPerformanceMetrics],
    ['AI usage', handleGetAIUsage],
    ['tool usage', handleGetToolUsage],
    ['recent searches', handleGetRecentSearches],
    ['insights', handleGetInsights],
    ['dashboard', handleGetDashboard],
  ])('%s: a bad timeRange answers 400 VALIDATION_ERROR with a coded field entry', async (_name, handler) => {
    const res = await handler(new NextRequest('http://localhost/api/analytics/x?timeRange=yesterday'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ success: false, code: 'VALIDATION_ERROR', message: 'Some values are not valid' });
    expect(body.fields).toEqual([
      expect.objectContaining({ field: 'timeRange', code: 'invalid_value', message: expect.stringMatching(/^Choose one of: /) }),
    ]);
  });
});

describe('analytics handlers: invalid bodies and parameters on the write routes', () => {
  const expectEnvelope = async (res: Response, fields: Array<Record<string, unknown>>) => {
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body).toMatchObject({ success: false, code: 'VALIDATION_ERROR', message: 'Some values are not valid' });
    expect(body.fields).toEqual(fields.map((f) => expect.objectContaining(f)));
    expect(JSON.stringify(body)).not.toContain('Invalid request:');
  };

  it('hide finding: a bad finding id and days answer 400 with a field per problem', async () => {
    const res = await handleHideFinding(post({ findingId: 'Bad Id!', days: 500 }));
    await expectEnvelope(res, [
      { field: 'findingId', code: 'invalid_format' },
      { field: 'days', code: 'too_big', message: 'Enter a number of at most 90.' },
    ]);
  });

  it('unhide finding: a missing finding id answers 400 with "This field is required."', async () => {
    const res = await handleUnhideFinding(new NextRequest('http://localhost/api/analytics/insights/hidden', { method: 'DELETE' }));
    await expectEnvelope(res, [{ field: 'findingId', code: 'invalid_type', message: 'This field is required.' }]);
  });

  it('update config: a wrong type answers 400 with a field error', async () => {
    const res = await handleUpdateConfig(post({ enabled: 'yes' }));
    await expectEnvelope(res, [{ field: 'enabled', code: 'invalid_type' }]);
  });

  it('set experience override: a bad id and a missing overrides object answer 400', async () => {
    const res = await handleSetExperienceOverride(post({ experienceId: 'not-a-uuid' }));
    await expectEnvelope(res, [
      { field: 'experienceId', code: 'invalid_format' },
      { field: 'overrides', code: 'invalid_type', message: 'This field is required.' },
    ]);
  });
});
