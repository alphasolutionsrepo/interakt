// src/features/ai-service/ai-service.provider-key.test.ts

/**
 * A provider whose vault key is missing or unreadable is a setup problem, not a provider
 * failure: the key is read before any call is made, the call is never sent or retried, the
 * circuit breaker isn't touched, and the caller gets PROVIDER_KEY_UNAVAILABLE. Nothing is
 * recorded as usage: the request never reached a provider.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const analytics = vi.hoisted(() => ({ trackUsage: vi.fn(), updateRealtimeMetrics: vi.fn() }));
vi.mock('./ai-service.analytics', () => analytics);
vi.mock('@/features/ai-providers/ai-providers.service', () => ({
  getProviderConfigById: async () => ({ id: 'prov-key', providerKey: 'ollama', displayName: 'Campus gateway', isEnabled: true, baseUrl: 'http://model.test', settings: {}, apiKey: null, apiKeySecret: 'ai_provider_campus' }),
  getModelById: async () => ({ id: 7, modelKey: 'qwen2.5:14b', capabilities: {} }),
  getProviderByKey: vi.fn(),
  getResolvedDefaults: vi.fn(),
}));
const vault = vi.hoisted(() => ({ readSecret: vi.fn() }));
vi.mock('@/features/secrets/secrets.service', () => vault);

import { getCircuitStatus, resetCircuit } from './ai-service.resilience';
import { chat, generateText } from './ai-service.service';

const fetchSpy = vi.fn();
const options = { providerId: 'prov-key', modelId: 7, maxRetries: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  resetCircuit('prov-key');
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

describe.each([['missing'], ['unreadable']] as const)('a provider key that is %s in the vault', (status) => {
  it.each([
    ['text generation', () => generateText('Say hi', options)],
    ['a chat completion', () => chat([{ role: 'user', content: 'Say hi' }], options)],
  ])('%s fails with PROVIDER_KEY_UNAVAILABLE, is read once (not retried), and never reaches the provider', async (_label, call) => {
    vault.readSecret.mockResolvedValue({ status });

    await expect(call()).rejects.toMatchObject({ code: 'PROVIDER_KEY_UNAVAILABLE', providerId: 'prov-key' });

    expect(vault.readSecret).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    // Not a provider failure: no usage row, no strike against the provider's circuit
    expect(analytics.trackUsage).not.toHaveBeenCalled();
    expect(getCircuitStatus('prov-key').failures).toBe(0);
  });
});
