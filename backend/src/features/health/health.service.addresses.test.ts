// src/features/health/health.service.addresses.test.ts

/**
 * The real provider health check's output, with only the provider list and the network
 * stubbed: every address it carries is removed for roles that can't view providers.
 */

import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/ai-providers/ai-providers.repository', () => ({
  listProviders: async () => [{ id: 'p1', providerKey: 'ollama', displayName: 'Ollama', baseUrl: 'http://10.0.0.5:11434', isEnabled: true }],
}));
const realFetch = globalThis.fetch;
globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;
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
});
