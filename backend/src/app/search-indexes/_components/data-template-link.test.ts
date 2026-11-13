// src/app/search-indexes/_components/data-template-link.test.ts

/**
 * A search index's page links to its data template ("View") only while /data-templates can be
 * opened. No rule closes that page today, so the page check is stubbed to answer yes or no:
 * the test pins that the link follows the check, not what the rules say.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SearchIndexDetailPage from '../(pages)/[id]/page';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }), useParams: () => ({ id: 'i' }), usePathname: () => '/', useSearchParams: () => new URLSearchParams(),
}));

const opened: string[] = [];
let dataTemplatesOpen = true;
vi.mock('@/features/access/page-permissions', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/features/access/page-permissions')>();
  return {
    ...real,
    canOpenPage: (path: string, ...rest: [never, never]) => {
      if (path === '/data-templates') { opened.push(path); return dataTemplatesOpen; }
      return real.canOpenPage(path, ...rest);
    },
  };
});

vi.mock('../_lib/hooks/useSearchIndexes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/hooks/useSearchIndexes')>()),
  useSearchIndex: () => ({
    searchIndex: {
      id: 'i', name: 'docs', displayName: 'Docs index', description: null, searchType: 'lexical', searchProvider: 'elasticsearch',
      status: 'active', isActive: true, isBuiltIn: false, language: 'english', synonyms: [], stopWords: [], documentCount: 0,
      lastIndexedAt: null, lastJob: null, numberOfShards: 1, numberOfReplicas: 0, refreshInterval: '1s', providerSettings: {},
      requiresReindex: false, dataTemplate: { id: 'tpl', name: 'Articles' }, indexingStrategy: null, aiProviderId: null, aiModelId: null,
      aiProvider: null, aiModel: null, embeddingDimensions: null, vectorSimilarity: null,
      createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
    },
    isLoading: false, isError: false,
    updateIndex: async () => {}, isUpdating: false, triggerReindex: async () => {}, isReindexing: false,
    recreateEmptyIndex: async () => {}, isRecreatingIndex: false,
    deleteIndex: async () => {}, isDeleting: false, activateIndex: async () => {}, deactivateIndex: async () => {},
    isActivating: false, isDeactivating: false,
  }),
  useIndexStats: () => ({ data: undefined, isLoading: false }),
  useSyncStatus: () => ({ data: undefined }),
}));
vi.mock('../_lib/hooks/useSearchIndexFields', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/hooks/useSearchIndexFields')>()),
  useFieldMappingSummary: () => ({ data: undefined, isLoading: false }),
}));

const detail = () =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(SearchIndexDetailPage as never)));
/** The "View" button next to the data template name */
const hasViewButton = (html: string) => />\s*View\s*</.test(html.replace(/<!-- -->/g, ''));

describe("a search index's data template link", () => {
  beforeEach(() => { opened.length = 0; dataTemplatesOpen = true; uiAccess.asAdmin(); });

  it('shows View next to the template name while /data-templates can be opened', () => {
    const html = detail();
    expect(html).toContain('Articles');
    expect(hasViewButton(html)).toBe(true);
    expect(opened).toContain('/data-templates');
  });

  it('keeps the name but hides View when /data-templates cannot be opened', () => {
    dataTemplatesOpen = false;
    const html = detail();
    expect(html).toContain('Articles');
    expect(hasViewButton(html)).toBe(false);
  });
});
