// src/app/api/admin/setup-demo/route.ollama-check.test.ts

/**
 * Demo Setup checks an Ollama URL the admin typed only when it is configured or on this
 * machine: any other URL is answered 400 with what to do, and nothing is fetched.
 */

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger([]));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUser: async () => ({ id: 'admin', role: 'admin' }) }));
vi.mock('@/shared/seeders/seed-registry.service', () => ({ getRegistryEntry: async () => null }));
vi.mock('@/features/ai-providers/ai-providers.service', () => ({ getProviderByKey: async () => ({ baseUrl: 'http://gpu-box.lan:11434' }) }));
vi.mock('@/shared/seeders/demo', () => ({
  loadDemoManifest: async () => ({
    manifest: {
      demo: { key: 'demo', name: 'Demo' },
      index: { name: 'demo' },
      searchExperience: { slug: 's' },
      chatExperience: { slug: 'c' },
      warmup: { enabled: false },
      provider: {
        recommended: 'ollama',
        options: { ollama: { key: 'ollama', label: 'Ollama', authType: 'none', requiredModels: [], defaults: { embeddingModel: 'nomic-embed-text' } } },
      },
    },
    documents: [],
    mapping: { fields: [] },
  }),
  seedDemo: vi.fn(), resetDemo: vi.fn(), runWarmup: vi.fn(),
}));

import { GET } from './route';

const fetched = vi.fn(async () => new Response(JSON.stringify({ models: [] })));
const status = (typed: string) => GET(new NextRequest(`http://localhost/api/admin/setup-demo?ollamaBaseUrl=${encodeURIComponent(typed)}`));

beforeEach(() => { fetched.mockClear(); vi.stubGlobal('fetch', fetched); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Demo Setup checking a typed Ollama URL', () => {
  it('refuses another host with what to do, and fetches nothing', async () => {
    const res = await status('http://169.254.169.254/latest');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ hint: expect.stringContaining('Ollama provider') });
    expect(fetched).not.toHaveBeenCalled();
  });

  it('checks the configured URL, and Ollama on this machine', async () => {
    expect((await status('http://gpu-box.lan:11434')).status).toBe(200);
    expect(fetched).toHaveBeenLastCalledWith('http://gpu-box.lan:11434/api/tags', expect.anything());
    expect((await status('http://localhost:11500')).status).toBe(200);
    expect(fetched).toHaveBeenLastCalledWith('http://localhost:11500/api/tags', expect.anything());
  });
});
