// src/features/data-source/data-source.service.missing-secret.test.ts

/**
 * Health check on an external Elasticsearch source whose credentials name a secret the vault
 * can't give: the stats and schema requests are not sent without the key, and the result
 * names the secret.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ getDataSourceById: vi.fn(), updateDataSource: vi.fn() }));
vi.mock('./data-source.repository', () => repository);
vi.mock('@/features/search-experience/search-experience.cache', () => ({ invalidateByDataSource: vi.fn() }));
vi.mock('@/features/search-index/search-index.repository', () => ({}));
vi.mock('@/features/secrets/secrets.service', () => ({
  resolveSecret: vi.fn(async (name: string) => (name === 'es_key' ? 'key-123' : null)),
}));
vi.mock('@/features/tools/tools.service', () => ({}));

import { performHealthCheck } from './data-source.service';

const source = (secretRef: string) => ({
  id: 'ds-1',
  type: 'search_index_external',
  config: {
    provider: 'elasticsearch',
    connection: {
      url: 'https://es.example.com', indexName: 'docs', authType: 'api_key', credentials: { secretRef },
    },
  },
  schema: null,
});

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }));
const indexRequests = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/docs/'));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  repository.updateDataSource.mockResolvedValue({});
});

describe('health check on an external Elasticsearch source with a credentials secret', () => {
  it('names the missing secret and sends no index request without the key', async () => {
    repository.getDataSourceById.mockResolvedValue(source('gone_key'));
    const result = await performHealthCheck('ds-1');
    expect(result.message).toContain('The secret "gone_key" used for this data source\'s connection is missing from the Secrets Vault');
    expect(indexRequests()).toHaveLength(0);
  });

  it('sends the key when the vault has the secret', async () => {
    repository.getDataSourceById.mockResolvedValue(source('es_key'));
    await performHealthCheck('ds-1');
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('_stats'));
    expect((call?.[1]?.headers as Record<string, string>).Authorization).toBe('ApiKey key-123');
  });
});
