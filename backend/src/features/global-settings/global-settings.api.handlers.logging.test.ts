// src/features/global-settings/global-settings.api.handlers.logging.test.ts

/**
 * A global settings request that fails answers as before and is logged once, by the error
 * response, with the request id, the operation and the error itself (its stack and
 * causes), not only its message.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  it('answers a failed read as before and logs it once, as an error with the request id, the operation and the error', async () => {
    const down = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    service.getGlobalSettingsForApi.mockRejectedValue(down);
    const res = await handleGetGlobalSettings();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({ message: down.message });
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId: body.requestId, operation: 'getGlobalSettings', err: down }) }),
    ]);
  });

  it('answers settings the service refuses as before and logs it once, as a warning', async () => {
    service.updateGlobalSettings.mockRejectedValue(new Error('Invalid settings: rrfRankConstant must be positive'));
    const res = await update();

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'BAD_REQUEST', message: 'Invalid settings: rrfRankConstant must be positive' });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ operation: 'updateGlobalSettings' }) })]);
  });

  it('logs a failed update once, as an error with the error', async () => {
    const down = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    service.updateGlobalSettings.mockRejectedValue(down);
    const res = await update();

    expect(res.status).toBe(500);
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ operation: 'updateGlobalSettings', err: down }) }),
    ]);
  });
});
