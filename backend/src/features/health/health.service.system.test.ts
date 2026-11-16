// src/features/health/health.service.system.test.ts

/**
 * The real checkSystemHealth, with only the database, search engine and AI provider stubbed:
 * the client-address check is part of it, and a problem there makes the whole status degraded.
 */

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/db/index', () => ({ db: { execute: async () => [] } }));
vi.mock('@/features/search/providers', () => ({
  getDefaultSearchEngineProvider: () => ({
    name: 'Stub',
    type: 'stub',
    checkHealth: async () => ({ connected: true, clusterStatus: 'green' }),
  }),
}));
vi.mock('@/features/ai-providers/ai-providers.repository', () => ({
  listProviders: async () => [{ id: 'p1', providerKey: 'ollama', displayName: 'Ollama', baseUrl: 'http://10.0.0.5:11434', isEnabled: true }],
}));
const realFetch = globalThis.fetch;
globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;

import { checkSystemHealth } from './health.service';

import { clientIp, resetClientAddressSetup } from '@/shared/api/client-ip';

afterEach(() => {
  vi.unstubAllEnvs();
  resetClientAddressSetup();
});
afterAll(() => { globalThis.fetch = realFetch; });

describe('checkSystemHealth', () => {
  it('includes the client-address check, healthy while requests match the setting', async () => {
    const health = await checkSystemHealth();
    expect(health.services.map((s) => s.name)).toContain('Client addresses');
    expect(health.status).toBe('healthy');
  });

  it('is degraded when the client-address check is', async () => {
    for (let i = 0; i < 5; i++) clientIp({ headers: new Headers() });
    const health = await checkSystemHealth();
    expect(health.services.find((s) => s.name === 'Client addresses')?.status).toBe('degraded');
    expect(health.status).toBe('degraded');
  });
});
