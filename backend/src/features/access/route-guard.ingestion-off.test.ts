// src/features/access/route-guard.ingestion-off.test.ts

/**
 * The ingestion-key path of the document routes with Managed indexes off: only a key live for
 * the index is told "turned off"; any other gets the key check's refusal, as with the area on,
 * and the handler never runs while the area is off. (The real keys and handlers are in features/feature-switches/feature-switches.integration.test.ts.)
 */

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
const key = vi.hoisted(() => ({ live: false, error: null as Error | null }));
vi.mock('@/features/ingestion-keys/ingestion-key.middleware', async (original) => ({
  ...(await original<typeof import('@/features/ingestion-keys/ingestion-key.middleware')>()),
  authenticateIngestionKey: async () => {
    if (key.error) throw key.error;
    return key.live ? { success: true, key: {} } : { success: false, response: new Response(null, { status: 401 }) };
  },
}));

import { withPermissionOrIngestionKey } from './route-guard';

import { TURNED_OFF_CODE } from '@/features/feature-switches/areas';
import { featureSwitchesStub } from '@/shared/test/feature-switches-stub';

const INDEX = '00000000-0000-4000-8000-0000000000aa';
const call = (handler: () => Promise<Response>) =>
  withPermissionOrIngestionKey('search-indexes:view', handler)(
    new NextRequest(`http://localhost/api/search-indexes/${INDEX}/documents`, { headers: { Authorization: 'Bearer k' } }),
    { params: Promise.resolve({ id: INDEX }) },
  );

afterEach(() => {
  featureSwitchesStub.reset();
  key.live = false;
  key.error = null;
});

describe('a document route called with an ingestion key, Managed indexes off', () => {
  it('tells a live key "turned off" without running the handler', async () => {
    featureSwitchesStub.off.add('managed-indexes');
    key.live = true;
    const handler = vi.fn(async () => new Response('ok'));
    const res = await call(handler);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: TURNED_OFF_CODE });
    expect(handler).not.toHaveBeenCalled();
  });

  it("gives any other key the key check's refusal, without running the handler", async () => {
    featureSwitchesStub.off.add('managed-indexes');
    const handler = vi.fn(async () => new Response('ok'));
    const res = await call(handler);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('answers a failed key lookup as an error', async () => {
    featureSwitchesStub.off.add('managed-indexes');
    key.error = new Error('database down');
    const handler = vi.fn(async () => new Response('ok'));
    expect((await call(handler)).status).toBe(500);
    expect(handler).not.toHaveBeenCalled();
  });

  it('runs the handler with the area on, without looking the key up first', async () => {
    key.error = new Error('should not be looked up');
    expect((await call(async () => new Response('ok'))).status).toBe(200);
  });
});
