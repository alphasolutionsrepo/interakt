// src/features/search/search.api.handlers.health-logging.test.ts

/**
 * A search health check that fails answers 503 as before and is logged once, by the
 * error response, with the operation and the error itself, not only its message.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/features/global-settings', () => ({ getGlobalSearchConfig: vi.fn() }));
vi.mock('@/features/telemetry', () => ({ runWithTelemetryLevel: (_level: string, fn: () => unknown) => fn() }));
const searchService = vi.hoisted(() => ({ checkHealth: vi.fn() }));
vi.mock('./search.service', () => searchService);

import { handleHealthCheck } from './search.api.handlers';

beforeEach(() => { logs.length = 0; });

describe('a search health check that fails', () => {
  it('answers 503 as before and logs it once, as an error with the request id, the operation and the error', async () => {
    const down = new Error('connect ECONNREFUSED 127.0.0.1:9200');
    searchService.checkHealth.mockRejectedValue(down);
    const res = await handleHealthCheck();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({ message: 'Search service health check failed' });
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId: body.requestId, operation: 'healthCheck', err: down }) }),
    ]);
  });
});
