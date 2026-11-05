// src/features/tools/executors/data-source/search.external-source.logging.test.ts

/**
 * A chat tool's search on an external source answers a failure to the model as a failed
 * call, so it logs it: once, with the error, at error when the source is down.
 */

import { describe, expect, it, vi } from 'vitest';

import { ExternalSearchError } from '@/features/data-source/external-search/external-search.types';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
const connector = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('@/features/search/search.service', () => ({ getExperienceContext: () => ({ experienceId: 'exp' }) }));
vi.mock('@/features/analytics', () => ({ trackSearch: vi.fn() }));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceById: vi.fn(async () => ({ schema: null })) }));
vi.mock('@/features/data-source/external-search/external-search.service', () => ({ getConnector: () => connector }));
vi.mock('@/features/search-index/search-index.service', () => ({ getSearchIndexById: vi.fn() }));
vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  resolveDataSource: vi.fn(async () => ({ kind: 'external', provider: 'sitecore-search', dataSourceId: 'ds' })),
}));

import { executeDataSourceSearch } from './search';

describe('a chat tool search on an external source', () => {
  it('that is down is answered as a failed call and logged once, as an error, with the error', async () => {
    const down = new ExternalSearchError('Sitecore Search', "Sitecore Search couldn't be reached", 503);
    connector.search.mockRejectedValueOnce(down);

    const result = await executeDataSourceSearch('ds', {}, { query: 'linen shirts' });

    expect(result.success).toBe(false);
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ dataSourceId: 'ds', err: down }) }),
    ]);
  });

  it('that refused the filter the model wrote (a value of the wrong type) is logged once, as a warning', async () => {
    logs.length = 0;
    // Sitecore's own words (checked live, 2 Nov)
    const refused = new ExternalSearchError('Sitecore Search', `Sitecore Search returned HTTP 400: {"message":"filter value '80' not of the expected type"}`, 400);
    connector.search.mockRejectedValueOnce(refused);

    await executeDataSourceSearch('ds', {}, { query: 'linen shirts', filters: [{ field: 'price', operator: 'gte', value: 80 }] });

    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ err: refused }) })]);
  });

  it('that refused something the request did not say is logged once, as an error', async () => {
    logs.length = 0;
    const refused = new ExternalSearchError('Sitecore Search', 'Sitecore Search returned HTTP 400: {"message":"invalid widget"}', 400);
    connector.search.mockRejectedValueOnce(refused);

    await executeDataSourceSearch('ds', {}, { query: 'linen shirts' });

    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ err: refused }) })]);
  });
});
