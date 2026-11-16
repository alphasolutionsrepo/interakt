// src/features/health/health.service.search-endpoint.test.ts

/**
 * The search check shows the address of the engine in use, never another engine's:
 * with Azure AI Search as the engine, no Elasticsearch address or cluster fields appear.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const engine = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));
vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/db/index', () => ({ db: { execute: async () => [] } }));
vi.mock('@/features/search/providers', () => ({ getDefaultSearchEngineProvider: () => engine.current }));
vi.mock('@/config', async (orig) => ({
  ...(await orig<typeof import('@/config')>()),
  elasticsearchConfig: { url: 'http://elastic:s3cret@es.internal:9200/some/path' },
}));

import { checkElasticsearchHealth } from './health.service';

import { withoutProviderAddresses } from '@/features/access/provider-addresses';

afterEach(() => vi.unstubAllEnvs());

describe('search provider health check endpoint', () => {
  it('shows the Elasticsearch address, host only, with its cluster fields', async () => {
    engine.current = {
      name: 'Elasticsearch',
      type: 'elasticsearch',
      checkHealth: async () => ({ connected: true, clusterName: 'c1', clusterStatus: 'green', numberOfNodes: 3, version: '8.1' }),
    };
    const check = await checkElasticsearchHealth();
    expect(check.details).toMatchObject({ endpoint: 'http://es.internal:9200', clusterName: 'c1', clusterStatus: 'green', numberOfNodes: 3 });
    expect(JSON.stringify(check)).not.toMatch(/s3cret|some\/path/);
  });

  it('shows the Azure endpoint, and no Elasticsearch address or cluster fields, for Azure AI Search', async () => {
    vi.stubEnv('AZURE_SEARCH_ENDPOINT', 'https://svc.search.windows.net/indexes?api-key=k');
    engine.current = {
      name: 'Azure AI Search',
      type: 'azure-ai-search',
      checkHealth: async () => ({ connected: true, clusterName: 'azure-ai-search' }),
    };
    const check = await checkElasticsearchHealth();
    const shown = JSON.stringify(check);
    expect(shown).not.toContain('es.internal');
    expect(check.details).toMatchObject({ endpoint: 'https://svc.search.windows.net' });
    expect(check.details).not.toHaveProperty('clusterName');
    expect(check.details).not.toHaveProperty('clusterStatus');
    expect(check.message).not.toMatch(/Cluster/);
    expect(shown).not.toContain('api-key');
  });

  it('leaves the endpoint out when the engine has none', async () => {
    vi.stubEnv('AZURE_SEARCH_ENDPOINT', '');
    engine.current = { name: 'Azure AI Search', type: 'azure-ai-search', checkHealth: async () => ({ connected: true }) };
    const check = await checkElasticsearchHealth();
    expect(check.details).not.toHaveProperty('endpoint');
    expect(JSON.stringify(check)).not.toContain('es.internal');
  });

  it("is removed for roles that can't view providers", async () => {
    engine.current = { name: 'Elasticsearch', type: 'elasticsearch', checkHealth: async () => ({ connected: true, clusterStatus: 'green' }) };
    const check = await checkElasticsearchHealth();
    expect(JSON.stringify(check)).toContain('es.internal');
    expect(JSON.stringify(withoutProviderAddresses(check))).not.toContain('es.internal');
  });
});
