// src/app/search-indexes/_components/index-page-access.test.ts

/**
 * A search index's detail page: Reindex (on the index name card and the reindex banner) and
 * Recreate Index (on the error banner) are document changes, so they are locked with the reason
 * without documents:edit, and on the built-in help for anyone but an Admin. The edit page's API
 * Access tab says why it is closed without secrets:manage.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EditSearchIndexPage from '../(pages)/[id]/edit/page';
import SearchIndexDetailPage from '../(pages)/[id]/page';

import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }), useParams: () => ({ id: 'i' }), usePathname: () => '/', useSearchParams: () => new URLSearchParams(),
}));
// Every tab's content renders, so the API Access tab is in the markup without a click
vi.mock('@/components/ui/tabs', async () => {
  const { createElement: h } = await import('react');
  const Inline = ({ children }: { children?: unknown }) => h('div', null, children as never);
  return { Tabs: Inline, TabsList: Inline, TabsTrigger: Inline, TabsContent: Inline };
});

let isBuiltIn = false;
let status = 'active';
let requiresReindex = false;
vi.mock('../_lib/hooks/useSearchIndexes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/hooks/useSearchIndexes')>()),
  useSearchIndex: () => ({
    searchIndex: {
      id: 'i', name: 'docs', displayName: 'Docs index', description: null, searchType: 'lexical', searchProvider: 'elasticsearch',
      status, isActive: true, isBuiltIn, language: 'english', synonyms: [], stopWords: [], documentCount: 0,
      lastIndexedAt: null, lastJob: null, numberOfShards: 1, numberOfReplicas: 0, refreshInterval: '1s', providerSettings: {},
      requiresReindex: false, dataTemplate: null, indexingStrategy: null, aiProviderId: null, aiModelId: null,
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
  useSyncStatus: () => ({ data: requiresReindex ? { requiresReindex: true } : undefined }),
}));
vi.mock('../_lib/hooks/useSearchIndexFields', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/hooks/useSearchIndexFields')>()),
  useFieldMappingSummary: () => ({ data: undefined, isLoading: false }),
}));

const render = (Page: () => unknown) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Page as never)));
const detail = () => render(SearchIndexDetailPage);

describe("a search index's page", () => {
  beforeEach(() => { isBuiltIn = false; status = 'active'; requiresReindex = false; });

  it('locks Reindex on the index name card with the reason for a role without documents:edit', () => {
    uiAccess.hold('search-indexes:view', 'search-indexes:edit');
    const html = detail();
    expect(controlState(html, { text: 'Reindex' })).toBe('locked');
    expect(html).toContain('You don&#x27;t have permission to reindex or recreate search indexes.');
  });

  it('opens Reindex for a role with documents:edit', () => {
    uiAccess.hold('search-indexes:view', 'documents:edit');
    expect(controlState(detail(), { text: 'Reindex' })).toBe('open');
  });

  it('locks Reindex on the built-in help for a documents editor who is not an Admin, not for an Admin', () => {
    isBuiltIn = true;
    uiAccess.hold('search-indexes:view', 'documents:edit');
    const html = detail();
    expect(controlState(html, { text: 'Reindex' })).toBe('locked');
    expect(html).toContain('Only an Admin can change the built-in help.');
    uiAccess.asAdmin();
    expect(controlState(detail(), { text: 'Reindex' })).toBe('open');
  });

  it('locks Reindex Now on the "reindex needed" banner without documents:edit, opens it with it', () => {
    requiresReindex = true;
    uiAccess.hold('search-indexes:view', 'search-indexes:edit');
    const html = detail();
    expect(controlState(html, { text: 'Reindex Now' })).toBe('locked');
    expect(html).toContain('You don&#x27;t have permission to reindex or recreate search indexes.');
    uiAccess.hold('search-indexes:view', 'documents:edit');
    expect(controlState(detail(), { text: 'Reindex Now' })).toBe('open');
  });

  it('locks Recreate Index on the error banner without documents:edit, opens it with it', () => {
    status = 'error';
    uiAccess.hold('search-indexes:view', 'search-indexes:edit');
    const html = detail();
    expect(controlState(html, { text: 'Recreate Index' })).toBe('locked');
    expect(html).toContain('You don&#x27;t have permission to reindex or recreate search indexes.');
    uiAccess.hold('search-indexes:view', 'documents:edit');
    expect(controlState(detail(), { text: 'Recreate Index' })).toBe('open');
  });

  it('locks Recreate Index and Reindex Now on the built-in help for a non-Admin', () => {
    isBuiltIn = true; status = 'error'; requiresReindex = true;
    uiAccess.hold('search-indexes:view', 'documents:edit');
    const html = detail();
    expect(controlState(html, { text: 'Recreate Index' })).toBe('locked');
    expect(controlState(html, { text: 'Reindex Now' })).toBe('locked');
  });
});

describe("a search index's edit page, API Access tab", () => {
  beforeEach(() => { isBuiltIn = false; status = 'active'; });

  it('says why the keys are closed for a role without secrets:manage', () => {
    uiAccess.hold('search-indexes:view', 'search-indexes:edit');
    const html = render(EditSearchIndexPage);
    expect(html).toContain('You don&#x27;t have permission to manage ingestion keys.');
  });

  it('shows no such line for a role with secrets:manage', () => {
    uiAccess.hold('search-indexes:view', 'search-indexes:edit', 'secrets:manage');
    expect(render(EditSearchIndexPage)).not.toContain('manage ingestion keys.');
  });
});
