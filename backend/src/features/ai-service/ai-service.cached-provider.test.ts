// src/features/ai-service/ai-service.cached-provider.test.ts

/**
 * A provider cached before connection types has none: its key picks the adapter, as it did
 * then ("ollama" speaks Ollama, any other OpenAI-compatible). Runs the real AI service and
 * adapters; only the stored provider and the network are faked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./ai-service.analytics', () => ({ trackUsage: vi.fn(), updateRealtimeMetrics: vi.fn() }));

const stored = vi.hoisted(() => ({ providerKey: 'ollama' }));
vi.mock('@/features/ai-providers/ai-providers.service', () => ({
  // No connectionType: saved in the cache before the field existed
  getProviderConfigById: async () => ({ id: 'prov-1', providerKey: stored.providerKey, isEnabled: true, baseUrl: 'http://model.test', settings: {} }),
  getModelById: async () => ({ id: 7, modelKey: 'm', capabilities: {} }),
  getProviderByKey: vi.fn(),
  getResolvedDefaults: vi.fn(),
}));

import { generateText } from './ai-service.service';

const model = vi.fn(async (url: string) => new Response(url.includes('/api/generate')
  ? '{"response":"Hi","done":true,"prompt_eval_count":1,"eval_count":1}'
  : JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })));

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', model); });
afterEach(() => vi.unstubAllGlobals());

describe('a provider cached without a connection type', () => {
  it.each([
    ['ollama', 'http://model.test/api/generate'],
    ['campus-ai', 'http://model.test/chat/completions'],
  ])('keyed %s is called through the adapter its key picked', async (providerKey, url) => {
    stored.providerKey = providerKey;
    await generateText('Say hi', { providerId: 'prov-1', modelId: 7 });
    expect(model.mock.calls[0][0]).toBe(url);
  });
});
