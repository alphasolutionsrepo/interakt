// src/app/search-indexes/_components/edit-access.test.ts

/**
 * A search index's edit, field mappings and upload pages: only an Admin changes the built-in
 * help, so anyone else opening one of them for a built-in index is told why and linked back,
 * instead of given a form whose save the server would refuse. An Admin, or an editor on any
 * other index, gets the page.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EditSearchIndexPage from '../(pages)/[id]/edit/page';
import FieldMappingsPage from '../(pages)/[id]/mappings/page';
import UploadPage from '../(pages)/[id]/upload/page';

import type { Permission } from '@/features/access/permissions';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }), useParams: () => ({ id: 'i' }), usePathname: () => '/', useSearchParams: () => new URLSearchParams(),
}));

let isBuiltIn = false;
vi.mock('../_lib/hooks/useSearchIndexes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/hooks/useSearchIndexes')>()),
  useSearchIndex: () => ({
    searchIndex: {
      id: 'i', name: 'docs', displayName: 'Docs index', description: null, searchType: 'lexical', searchProvider: 'elasticsearch',
      status: 'active', isActive: true, isBuiltIn, language: 'english', synonyms: [], stopWords: [], documentCount: 0,
      lastIndexedAt: null, numberOfShards: 1, numberOfReplicas: 0, refreshInterval: '1s', providerSettings: {},
      requiresReindex: false, dataTemplate: null, indexingStrategy: null, aiProviderId: null, aiModelId: null,
      aiProvider: null, aiModel: null, embeddingDimensions: null, vectorSimilarity: null,
      createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
    },
    isLoading: false, isError: false,
    updateIndex: async () => {}, isUpdating: false, triggerReindex: async () => {}, isReindexing: false,
  }),
}));

const render = (Page: ComponentType) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Page)));

const LOCK = 'You can&#x27;t change this';
const PAGES: Array<{ name: string; Page: ComponentType; edits: Permission[]; marker: RegExp }> = [
  { name: 'edit', Page: EditSearchIndexPage, edits: ['search-indexes:view', 'search-indexes:edit'], marker: /Save Changes/ },
  { name: 'field mappings', Page: FieldMappingsPage, edits: ['search-indexes:view', 'search-indexes:edit'], marker: /<h1[^>]*>\s*Fields\s*<\/h1>/ },
  { name: 'upload', Page: UploadPage, edits: ['search-indexes:view', 'documents:edit'], marker: /Upload Documents/ },
];

describe.each(PAGES)("a built-in index's $name page", ({ Page, edits, marker }) => {
  beforeEach(() => { isBuiltIn = true; });

  it('tells an editor who is not an Admin why, and links back', () => {
    uiAccess.hold(...edits);
    const html = render(Page);
    expect(html).toContain(LOCK);
    expect(html).toContain('Only an Admin can change the built-in help.');
    expect(html).toContain('href="/search-indexes/i"');
    expect(html).not.toMatch(marker);
  });

  it('is the page for an Admin', () => {
    uiAccess.asAdmin();
    const html = render(Page);
    expect(html).toMatch(marker);
    expect(html).not.toContain(LOCK);
  });

  it('is the page for an editor on any other index', () => {
    isBuiltIn = false;
    uiAccess.hold(...edits);
    const html = render(Page);
    expect(html).toMatch(marker);
    expect(html).not.toContain(LOCK);
  });
});
