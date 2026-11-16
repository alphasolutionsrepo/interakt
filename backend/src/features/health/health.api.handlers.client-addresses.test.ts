// src/features/health/health.api.handlers.client-addresses.test.ts

/** GET /api/health for a signed-in caller carries the Client addresses check, through the real service. */

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'u' }));
vi.mock('@/db/index', () => ({ db: { execute: async () => [] } }));
vi.mock('@/features/search/providers', () => ({
  getDefaultSearchEngineProvider: () => ({
    name: 'Stub',
    type: 'stub',
    checkHealth: async () => ({ connected: true, clusterStatus: 'green' }),
  }),
}));
vi.mock('@/features/ai-providers/ai-providers.repository', () => ({ listProviders: async () => [] }));

import { GET as systemHealth } from '@/app/api/health/route';
import { clientIp, resetClientAddressSetup } from '@/shared/api/client-ip';
import { accessStub } from '@/shared/test/access-stub';

afterEach(() => {
  accessStub.reset();
  resetClientAddressSetup();
});

interface Service { name: string; status: string; message?: string; details?: Record<string, unknown> }

describe('GET /api/health, Client addresses', () => {
  it('returns the check with its status, message and counts', async () => {
    clientIp({ headers: new Headers({ 'X-Forwarded-For': '9.9.9.9' }) });
    for (let i = 0; i < 5; i++) clientIp({ headers: new Headers() });
    const res = await systemHealth(new NextRequest('http://localhost/api/health'));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const check = (data.services as Service[]).find((service) => service.name === 'Client addresses');
    expect(check).toMatchObject({
      status: 'degraded',
      details: { setting: 'forwarded-for:1', requestsWithAddress: 1, requestsWithoutAddress: 5 },
    });
    expect(check?.message).toMatch(/5 requests had no client address Interakt can trust/);
    expect(data.status).toBe('degraded');
  });
});
