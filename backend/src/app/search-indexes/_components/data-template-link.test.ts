// src/app/search-indexes/_components/data-template-link.test.ts

/** A search index's page names its data template; no page exists for it, so there is no link. */

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

describe("a search index's data template", () => {
  beforeEach(() => { uiAccess.asAdmin(); });

  it('shows the template name and links nowhere (there is no data-templates page)', () => {
    const html = detail();
    expect(html).toContain('Articles');
    expect(html).not.toContain('/data-templates');
    expect(html.replace(/<!-- -->/g, '')).not.toMatch(/>\s*View\s*</);
  });
});
