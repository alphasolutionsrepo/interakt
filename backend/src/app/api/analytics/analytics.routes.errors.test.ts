// src/app/api/analytics/analytics.routes.errors.test.ts

/**
 * The analytics routes answer a failure on our side without its text (a database error
 * is its SQL), with a request id, and log it once. A request that is wrong keeps its
 * status and says what is wrong.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorEvent, expectInternalFailure, expectInvalidJson, failedQuery, notJson } from '@/shared/test/error-answers';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
const services = vi.hoisted(() => ({
  getExperienceSummaries: vi.fn(),
  clearAnalyticsData: vi.fn(),
  runAnalyticsProcessing: vi.fn(),
  getProcessingStatus: vi.fn(),
}));
vi.mock('@/features/analytics/analytics-experience-summary.service', () => ({ getExperienceSummaries: services.getExperienceSummaries }));
vi.mock('@/features/analytics/analytics-data-management.service', () => ({ clearAnalyticsData: services.clearAnalyticsData }));
vi.mock('@/features/analytics/analytics-processing.service', () => ({
  runAnalyticsProcessing: services.runAnalyticsProcessing,
  getProcessingStatus: services.getProcessingStatus,
}));
const sessions = vi.hoisted(() => ({ getOrCreateSession: vi.fn(), endSession: vi.fn() }));
vi.mock('@/features/analytics', () => ({ ...sessions, generateSessionId: () => 'generated', hashIP: vi.fn() }));

import { DELETE as clearData } from './data/route';
import { GET as experienceSummary } from './experience-summary/route';
import { GET as processingStatus, POST as process } from './process/route';
import { DELETE as endSession, POST as startSession } from './session/route';

const EXPERIENCE = '5b0e3a52-8a7e-4a0e-9f61-2f1e9b1f2c11';
const request = (path: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost/api/analytics${path}`, { method, ...(body !== undefined && { body: JSON.stringify(body) }) });

beforeEach(() => {
  logs.length = 0;
  vi.clearAllMocks();
});

describe('an analytics request that fails on our side', () => {
  it.each([
    ['the experience summary', 'getExperienceSummaries', () => experienceSummary(request('/experience-summary')), 'getExperienceSummaries'],
    ['clearing data', 'clearAnalyticsData', () => clearData(request('/data', 'DELETE', { scope: 'all' })), 'clearAnalyticsData'],
    ['the processing status', 'getProcessingStatus', () => processingStatus(request('/process')), 'getAnalyticsProcessingStatus'],
    ['starting processing', 'getProcessingStatus', () => process(request('/process', 'POST', { experienceId: EXPERIENCE })), 'startAnalyticsProcessing'],
  ] as const)('%s answers 500 without the SQL, with a request id, logged once', async (_, failing, call, operation) => {
    const down = failedQuery();
    services[failing].mockRejectedValue(down);

    const res = await call();

    expect(res.status).toBe(500);
    expectInternalFailure(await res.json(), logs, operation, down);
  });

  it.each([
    ['starting a session', 'getOrCreateSession', () => startSession(request('/session', 'POST', { sessionType: 'chat' })), 'startAnalyticsSession'],
    ['ending a session', 'endSession', () => endSession(request('/session', 'DELETE', { sessionId: 's1' })), 'endAnalyticsSession'],
  ] as const)('%s that fails answers 500 without the SQL, with a request id, logged once', async (_, failing, call, operation) => {
    const down = failedQuery();
    sessions[failing].mockRejectedValueOnce(down);

    const res = await call();

    expect(res.status).toBe(500);
    expectInternalFailure(await res.json(), logs, operation, down);
  });

  it('processing that fails sends an error event without the SQL, with a request id, logged once', async () => {
    const down = failedQuery();
    services.getProcessingStatus.mockResolvedValue({ currentRun: null });
    services.runAnalyticsProcessing.mockRejectedValue(down);

    const res = await process(request('/process', 'POST', { experienceId: EXPERIENCE }));

    expect(res.status).toBe(200);
    expectInternalFailure(await errorEvent(res), logs, 'runAnalyticsProcessing', down);
  });
});

describe('an analytics request that is wrong', () => {
  it('a period that is wrong answers 400 with what is wrong, and logs nothing', async () => {
    const res = await experienceSummary(request('/experience-summary?from=2026-10-02T00:00:00Z&to=2026-10-01T00:00:00Z'));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'BAD_REQUEST', message: 'from must be before to', error: 'from must be before to' });
    expect(reported(logs)).toEqual([]);
  });

  it('a time range that is not one of the presets answers 400, and nothing is looked up', async () => {
    const res = await experienceSummary(request('/experience-summary?timeRange=custom'));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('timeRange must be one of 1h, 24h, 7d, 30d, 90d') });
    expect(services.getExperienceSummaries).not.toHaveBeenCalled();
  });

  it('clearing an unknown scope answers 400 in the shared shape', async () => {
    const res = await clearData(request('/data', 'DELETE', { scope: 'everything' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'BAD_REQUEST', error: expect.stringContaining('Invalid scope: everything'), requestId: expect.any(String) });
  });

  it.each([['null', null], ['a list', []], ['text', 'all']])('clearing with %s for a body answers 400 and clears nothing', async (_, body) => {
    const res = await clearData(request('/data', 'DELETE', body));

    expect(res.status).toBe(400);
    expect(services.clearAnalyticsData).not.toHaveBeenCalled();
  });

  it.each([
    ['starting a session', () => startSession(notJson('http://localhost/api/analytics/session', 'POST'))],
    ['ending a session', () => endSession(notJson('http://localhost/api/analytics/session', 'DELETE'))],
  ])('%s with a body that is not JSON answers 400, logged once as a warning', async (_, call) => {
    await expectInvalidJson(await call(), logs);
  });

  it('clearing with a body that is not JSON answers 400 and clears nothing (read as {}, it would clear all)', async () => {
    await expectInvalidJson(await clearData(notJson('http://localhost/api/analytics/data', 'DELETE')), logs);
    expect(services.clearAnalyticsData).not.toHaveBeenCalled();
  });

  it.each([
    ['starting a session of an unknown type', () => startSession(request('/session', 'POST', { sessionType: 'other' }))],
    ['ending a session without its id', () => endSession(request('/session', 'DELETE', {}))],
  ])('%s answers 400 with the fields that are wrong, and logs nothing', async (_, call) => {
    const res = await call();

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'VALIDATION_ERROR', fields: [expect.objectContaining({ field: expect.any(String) })] });
    expect(reported(logs)).toEqual([]);
  });
});
