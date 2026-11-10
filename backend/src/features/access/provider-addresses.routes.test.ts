// src/features/access/provider-addresses.routes.test.ts

/**
 * AI provider addresses reach only roles that view providers, on the real routes that list
 * providers for anyone who picks a model (the provider service stubbed).
 */

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'u' }));
const provider = { id: 'p1', displayName: 'Ollama', baseUrl: 'http://admin:s3cret@10.0.0.5:11434', models: [{ id: 1, modelKey: 'qwen' }] };
vi.mock('@/features/ai-providers/ai-providers.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/ai-providers/ai-providers.service')>()),
  listProviders: async () => [provider],
  getSystemDefaults: async () => ({ defaultTextProvider: provider, defaultTextModel: provider.models[0] }),
}));

import * as providers from '@/app/api/ai-providers/route';
import * as defaults from '@/app/api/system-defaults/ai/route';
import { accessStub } from '@/shared/test/access-stub';

import type { Permission } from './permissions';

afterEach(() => accessStub.reset());

const as = (...permissions: Permission[]) => {
  accessStub.access = { ...accessStub.access!, isAdmin: false, permissions: new Set(permissions) };
};
const text = async (fn: unknown, url: string) => {
  const res = await (fn as (r: NextRequest) => Promise<Response>)(new NextRequest(`http://localhost${url}`));
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('application/json');
  return JSON.stringify(await res.json());
};

describe('AI provider addresses on the model-picker routes', () => {
  it('reach a role that views providers', async () => {
    as('ai-providers:view');
    expect(await text(providers.GET, '/api/ai-providers')).toContain('10.0.0.5');
    expect(await text(defaults.GET, '/api/system-defaults/ai')).toContain('10.0.0.5');
  });

  it.each<Permission[]>([['playground:use'], ['analytics:ask'], ['search-experiences:edit', 'search-experiences:view'], ['settings:view']])(
    'are left out for %s, which still gets the providers and models',
    async (...permissions) => {
      as(...permissions);
      for (const [fn, url] of [[providers.GET, '/api/ai-providers'], [defaults.GET, '/api/system-defaults/ai']] as const) {
        const body = await text(fn, url);
        expect(body).not.toMatch(/10\.0\.0\.5|s3cret|baseUrl/);
        expect(body).toContain('Ollama');
        expect(body).toContain('qwen');
      }
    },
  );
});
