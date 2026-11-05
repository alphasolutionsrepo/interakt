// src/app/api/search-indexes/providers/route.errors.test.ts

/**
 * The search provider list answers a failure without the error's text, with a request
 * id, and logs it once.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { expectInternalFailure, failedQuery } from '@/shared/test/error-answers';
import type { LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
const failure = vi.hoisted(() => ({ error: undefined as unknown }));
vi.mock('@/features/search/providers', () => ({
  getEnabledProviderTypes: () => { throw failure.error; },
  getSearchEngineProvider: vi.fn(),
}));

import { GET } from './route';

beforeEach(() => { logs.length = 0; });

describe('the search provider list', () => {
  it('answers a failure 500 without the error text, with a request id, logged once', async () => {
    failure.error = failedQuery();
    const res = await GET();

    expect(res.status).toBe(500);
    expectInternalFailure(await res.json(), logs, 'listSearchProviders', failure.error);
  });
});
