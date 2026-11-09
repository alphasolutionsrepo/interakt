// src/features/telemetry/telemetry.api.handlers.logging.test.ts

/**
 * A telemetry request that fails answers as before and is logged once, by the error
 * response, with the request id, the operation and the error itself: before, the
 * handler logged it and the error response logged its message again.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));
const config = vi.hoisted(() => ({
  getTelemetryStatus: vi.fn(),
  setExperienceTelemetryOverride: vi.fn(),
  clearExperienceTelemetryOverride: vi.fn(),
  clearAllTelemetryOverrides: vi.fn(),
}));
vi.mock('./telemetry.config', () => config);
vi.mock('./telemetry-query.service', () => ({}));

import { handleGetTelemetryConfig } from './telemetry.api.handlers';

beforeEach(() => { logs.length = 0; });

describe('a telemetry request that fails', () => {
  it('answers as before and logs it once, as an error with the request id, the operation and the error', async () => {
    const broken = new Error('Cannot read properties of undefined (reading "level")');
    config.getTelemetryStatus.mockImplementation(() => { throw broken; });
    const res = await handleGetTelemetryConfig();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({ message: 'Failed to get telemetry config' });
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId: body.requestId, operation: 'getTelemetryConfig', err: broken }) }),
    ]);
  });
});
