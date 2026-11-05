// src/features/global-settings/global-settings.api.handlers.logging.test.ts

/**
 * A global settings request that fails is logged once, by the error response, with the
 * request id, the operation and the error itself (its stack and causes), not only its
 * message. A failure on our side is answered without the error's text (a database error
 * is its SQL); settings the service refuses are answered with its message.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { expectInternalFailure, expectInvalidJson, failedQuery, notJson } from '@/shared/test/error-answers';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
const service = vi.hoisted(() => ({ getGlobalSettingsForApi: vi.fn(), updateGlobalSettings: vi.fn() }));
vi.mock('./global-settings.service', () => service);

import { handleGetGlobalSettings, handleUpdateGlobalSettings } from './global-settings.api.handlers';

const update = () => handleUpdateGlobalSettings(new NextRequest('http://localhost/api/settings/search', {
  method: 'PUT',
  body: JSON.stringify({ searchTimeout: 5000 }),
}));

beforeEach(() => { logs.length = 0; });

describe('a global settings request that fails', () => {
  it('answers a failed read without the SQL, with a request id, and logs it once, as an error with the operation and the error', async () => {
    const down = failedQuery();
    service.getGlobalSettingsForApi.mockRejectedValue(down);
    const res = await handleGetGlobalSettings();

    expect(res.status).toBe(500);
    expectInternalFailure(await res.json(), logs, 'getGlobalSettings', down);
  });

  it('answers settings the service refuses as before and logs it once, as a warning', async () => {
    service.updateGlobalSettings.mockRejectedValue(new Error('Invalid settings: rrfRankConstant must be positive'));
    const res = await update();

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'BAD_REQUEST', message: 'Invalid settings: rrfRankConstant must be positive' });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ operation: 'updateGlobalSettings' }) })]);
  });

  it('answers a failed update without the SQL, with a request id, and logs it once, as an error with the error', async () => {
    const down = failedQuery();
    service.updateGlobalSettings.mockRejectedValue(down);
    const res = await update();

    expect(res.status).toBe(500);
    expectInternalFailure(await res.json(), logs, 'updateGlobalSettings', down);
  });

  it('answers an update whose body is not JSON with 400, logged once as a warning', async () => {
    await expectInvalidJson(await handleUpdateGlobalSettings(notJson('http://localhost/api/settings/search', 'PUT')), logs);
  });
});
