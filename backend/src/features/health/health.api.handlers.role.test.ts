// src/features/health/health.api.handlers.role.test.ts

/** Health is open to every signed-in role; AI provider addresses only to roles that view providers. */

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'u' }));
const search = {
  name: 'Search Engine', status: 'healthy', responseTime: 4,
  details: { endpoint: 'http://10.0.0.9:9200', endpointTested: 'http://10.0.0.9:9200/_cluster/health', provider: 'elasticsearch' },
};
const providers = {
  name: 'AI Providers', status: 'healthy', responseTime: 3,
  details: { providers: [{ key: 'ollama', status: 'healthy', baseUrl: 'http://10.0.0.5:11434' }] },
};
vi.mock('./health.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./health.service')>()),
  checkAIProvidersHealth: async () => providers,
  checkElasticsearchHealth: async () => search,
  checkSystemHealth: async () => ({ status: 'healthy', services: [providers] }),
}));

import { GET as providersHealth } from '@/app/api/health/ai-providers/route';
import { GET as searchHealth } from '@/app/api/health/elasticsearch/route';
import { GET as systemHealth } from '@/app/api/health/route';
import { accessStub } from '@/shared/test/access-stub';

afterEach(() => accessStub.reset());

const body = async (res: Response) => JSON.stringify(await res.json());

describe('health by role', () => {
  it('shows provider addresses to a role that views providers', async () => {
    accessStub.access = { ...accessStub.access!, isAdmin: false, permissions: new Set(['ai-providers:view']) };
    expect(await body(await providersHealth(new NextRequest('http://localhost/api/health/ai-providers')))).toContain('10.0.0.5');
  });

  it('leaves them out for any other role, on both health routes, and keeps the statuses', async () => {
    accessStub.access = { ...accessStub.access!, isAdmin: false, permissions: new Set() };
    const one = await body(await providersHealth(new NextRequest('http://localhost/api/health/ai-providers')));
    const all = await body(await systemHealth(new NextRequest('http://localhost/api/health')));
    for (const text of [one, all]) {
      expect(text).not.toContain('10.0.0.5');
      expect(text).toContain('"status":"healthy"');
    }
  });

  const siblings = [
    ['/api/health/elasticsearch', searchHealth, '10.0.0.9'],
    ['/api/health/ai-providers', providersHealth, '10.0.0.5'],
  ] as const;

  it.each(siblings)('%s leaves out every address key for a role that cannot view providers', async (path, route, host) => {
    accessStub.access = { ...accessStub.access!, isAdmin: false, permissions: new Set() };
    const text = await body(await route(new NextRequest(`http://localhost${path}`)));
    expect(text).not.toContain(host);
    for (const key of ['"endpoint"', '"baseUrl"', '"endpointTested"']) expect(text).not.toContain(key);
    expect(text).toContain('"status":"healthy"');
  });

  it.each(siblings)('%s keeps the addresses for a role that views providers', async (path, route, host) => {
    accessStub.access = { ...accessStub.access!, isAdmin: false, permissions: new Set(['ai-providers:view']) };
    expect(await body(await route(new NextRequest(`http://localhost${path}`)))).toContain(host);
  });
});
