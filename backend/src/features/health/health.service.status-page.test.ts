// src/features/health/health.service.status-page.test.ts

/**
 * The provider health check reads the vendor's public status page only for a provider on that
 * vendor's own domain; the same key on another server is checked on that server.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const providers = vi.hoisted(() => ({ list: [] as Array<Record<string, unknown>> }));
vi.mock('@/features/ai-providers/ai-providers.repository', () => ({ listProviders: async () => providers.list }));

const realFetch = globalThis.fetch;
const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ status: { indicator: 'none', description: 'ok' } }), { status: 200 }));
globalThis.fetch = fetchMock as typeof fetch;
afterAll(() => { globalThis.fetch = realFetch; });

import { checkAIProvidersHealth } from './health.service';

beforeEach(() => { fetchMock.mockClear(); });

describe('the vendor status page', () => {
  it("is read for a provider on the vendor's own domain", async () => {
    providers.list = [{ id: 'p', providerKey: 'openai', displayName: 'OpenAI', baseUrl: 'https://api.openai.com/v1', connectionType: 'openai_compatible', apiKey: 'k', isEnabled: true }];
    const health = await checkAIProvidersHealth();
    expect(fetchMock.mock.calls[0][0]).toBe('https://status.openai.com/api/v2/status.json');
    expect((health.details!.providers as Array<{ healthy: boolean; message: string }>)[0]).toMatchObject({ healthy: true, message: 'Operational' });
  });

  it('is not read for a provider with the same key on another server', async () => {
    providers.list = [{ id: 'p', providerKey: 'openai', displayName: 'OpenAI', baseUrl: 'http://localhost:8000/v1', connectionType: 'openai_compatible', apiKey: 'k', isEnabled: true }];
    await checkAIProvidersHealth();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/v1/models');
  });
});
