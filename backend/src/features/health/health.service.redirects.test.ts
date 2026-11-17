// src/features/health/health.service.redirects.test.ts

/**
 * The provider health check: a provider's own server is checked on that server only (a
 * redirect elsewhere is refused), while a vendor's public status page, a fixed address with
 * nothing of ours sent, may move (Anthropic's redirects to another host).
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const providers = vi.hoisted(() => ({ list: [] as Array<Record<string, unknown>> }));
vi.mock('@/features/ai-providers/ai-providers.repository', () => ({ listProviders: async () => providers.list }));

const realFetch = globalThis.fetch;
const fetchMock = vi.fn();
globalThis.fetch = fetchMock as typeof fetch;
afterAll(() => { globalThis.fetch = realFetch; });

import { checkAIProvidersHealth } from './health.service';

const provider = (over: Record<string, unknown>) => ({ id: 'p', displayName: 'P', isEnabled: true, apiKey: 'k', ...over });
type Detail = { key: string; healthy: boolean; message: string };

beforeEach(() => { fetchMock.mockReset(); });

describe('the provider health check and redirects', () => {
  it("follows a vendor status page that moved to another host", async () => {
    providers.list = [provider({ providerKey: 'anthropic', connectionType: 'openai_compatible', baseUrl: 'https://api.anthropic.com/v1' })];
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      // Plain fetch follows the redirect itself; the check must not ask for manual redirects
      expect(init.redirect).toBeUndefined();
      return new Response(JSON.stringify({ status: { indicator: 'none', description: 'ok' } }), { status: 200 });
    });

    const health = await checkAIProvidersHealth();
    expect((health.details!.providers as Detail[])[0]).toMatchObject({ healthy: true, message: 'Operational' });
  });

  it("refuses a provider's own server redirecting to another server", async () => {
    providers.list = [provider({ providerKey: 'campus-ai', connectionType: 'openai_compatible', baseUrl: 'https://ai.example.edu/v1' })];
    fetchMock.mockImplementation(async () => new Response(null, { status: 307, headers: { location: 'https://elsewhere.example.com/v1/models' } }));

    const health = await checkAIProvidersHealth();
    const detail = (health.details!.providers as Detail[])[0];
    expect(detail).toMatchObject({ healthy: false, message: 'Redirected to another server (not followed)' });
    // Health readers may not see provider addresses: the other server isn't named
    expect(JSON.stringify(health)).not.toContain('elsewhere.example.com');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });
});
