// src/app/api/admin/admin.routes.errors.test.ts

/**
 * The admin seeding and setup routes answer a failure on our side without its text (a
 * database error is its SQL), with a request id, and log it once: as a JSON answer, or
 * as the error event of the setup stream. A request that is wrong keeps its status.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';


const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
const auth = vi.hoisted(() => ({ getCurrentUserId: vi.fn() }));
vi.mock('@/shared/utils/auth-utils', () => auth);
const seeders = vi.hoisted(() => ({
  runAllSeeding: vi.fn(),
  verifyAllSeeding: vi.fn(),
  getOverallSeedingStatus: vi.fn(),
  seedDemo: vi.fn(),
  seedDocs: vi.fn(),
}));
vi.mock('@/shared/seeders', () => ({
  runAllSeeding: seeders.runAllSeeding,
  verifyAllSeeding: seeders.verifyAllSeeding,
  getOverallSeedingStatus: seeders.getOverallSeedingStatus,
}));
vi.mock('@/shared/seeders/demo', () => ({
  loadDemoManifest: async () => ({ manifest: { demo: { key: 'demo' }, warmup: { enabled: false } } }),
  seedDemo: seeders.seedDemo,
  resetDemo: vi.fn(),
  runWarmup: vi.fn(),
}));
vi.mock('@/shared/seeders/docs', () => ({ seedDocs: seeders.seedDocs, resetDocs: vi.fn(), getDocsSeedStatus: vi.fn() }));
vi.mock('@/shared/seeders/seed-registry.service', () => ({ getRegistryEntry: async () => null }));
vi.mock('@/features/ai-providers/ai-providers.service', () => ({ getProviderByKey: async () => null }));

import { DELETE as clearRegistry, GET as seedingStatus, POST as runSeeding } from './route';
import { POST as setupDemo } from './setup-demo/route';
import { POST as setupDocs } from './setup-docs/route';

import { errorEvent, expectInternalFailure, failedQuery } from '@/shared/test/error-answers';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const request = (path: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost/api/admin${path}`, { method, ...(body !== undefined && { body: JSON.stringify(body) }) });

beforeEach(() => {
  logs.length = 0;
  vi.clearAllMocks();
  auth.getCurrentUserId.mockResolvedValue('admin');
});

describe('an admin request that fails on our side', () => {
  it('running the seeders answers 500 without the SQL, with a request id, logged once', async () => {
    const down = failedQuery();
    seeders.runAllSeeding.mockRejectedValue(down);

    const res = await runSeeding(request('', 'POST', {}));

    expect(res.status).toBe(500);
    expectInternalFailure(await res.json(), logs, 'runSeeding', down);
  });

  it('the seeding status answers 500 without the SQL, with a request id, logged once', async () => {
    const down = failedQuery();
    seeders.getOverallSeedingStatus.mockRejectedValue(down);

    const res = await seedingStatus(request(''));

    expect(res.status).toBe(500);
    expectInternalFailure(await res.json(), logs, 'getSeedingStatus', down);
  });

  it('clearing the seed registry answers 500 without the error text, with a request id, logged once', async () => {
    const down = failedQuery();
    auth.getCurrentUserId.mockRejectedValue(down);

    const res = await clearRegistry(request('', 'DELETE', { type: 'all', confirm: true }));

    expect(res.status).toBe(500);
    expectInternalFailure(await res.json(), logs, 'clearSeedRegistry', down);
  });

  it.each([
    ['the demo', () => setupDemo(request('/setup-demo', 'POST', { stream: true })), 'seedDemo', 'setupDemoStream'],
    ['the docs assistant', () => setupDocs(request('/setup-docs', 'POST', { stream: true })), 'seedDocs', 'setupDocsStream'],
  ] as const)('setting up %s sends an error event without the SQL, with a request id, logged once', async (_, call, failing, operation) => {
    const down = failedQuery();
    seeders[failing].mockRejectedValue(down);

    const res = await call();

    expect(res.status).toBe(200);
    expectInternalFailure(await errorEvent(res), logs, operation, down);
  });
});

describe('an admin request that is wrong', () => {
  it('running the seeders signed out answers 401 as before, and logs nothing', async () => {
    auth.getCurrentUserId.mockResolvedValue(null);

    const res = await runSeeding(request('', 'POST', {}));

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'Authentication required' });
    expect(reported(logs)).toEqual([]);
  });

  it('clearing the seed registry unconfirmed answers 400 as before', async () => {
    const res = await clearRegistry(request('', 'DELETE', { type: 'all' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('Confirmation required') });
  });
});
