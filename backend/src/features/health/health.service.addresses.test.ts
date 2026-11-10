// src/features/health/health.service.addresses.test.ts

/**
 * The real provider health check's output, with only the provider list and the network
 * stubbed: every address it carries is removed for roles that can't view providers.
 */

import { afterAll, describe, expect, it, vi } from 'vitest';

const providers = vi.hoisted(() => ({
  list: [{ id: 'p1', providerKey: 'ollama', displayName: 'Ollama', baseUrl: 'http://10.0.0.5:11434', isEnabled: true }],
}));
vi.mock('@/features/ai-providers/ai-providers.repository', () => ({ listProviders: async () => providers.list }));
const realFetch = globalThis.fetch;
const stubFetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;
globalThis.fetch = stubFetch;
afterAll(() => { globalThis.fetch = realFetch; });

import { checkAIProvidersHealth, withoutProviderAddresses } from './health.service';

describe('provider addresses in health output', () => {
  it('are in the real output, and none is left after removing them', async () => {
    const health = await checkAIProvidersHealth();
    expect(JSON.stringify(health)).toContain('10.0.0.5');
    const shown = JSON.stringify(withoutProviderAddresses(health));
    expect(shown).not.toContain('10.0.0.5');
    expect(shown).toContain('Ollama');
  });

  it("are not quoted in a failed check's message, where the real fetch puts them", async () => {
    // Node's fetch quotes the whole address, password included, when it can't build the request
    globalThis.fetch = realFetch;
    try {
      for (const baseUrl of ['http://admin:s3cret@10.0.0.6:11434', 'http://10.0.0.7 :11434']) {
        providers.list = [{ ...providers.list[0], baseUrl }];
        const health = await checkAIProvidersHealth();
        const shown = JSON.stringify(withoutProviderAddresses(health));
        expect(shown).toContain('Invalid provider address');
        expect(shown).not.toMatch(/s3cret|10\.0\.0\.[67]/);
      }
    } finally {
      globalThis.fetch = stubFetch;
    }
  });
});
