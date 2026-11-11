// src/app/search-experiences/_components/link-access.test.ts

/**
 * Links from a search experience to its indexes and data sources show only to a role that can
 * open those pages; for anyone else the source still shows, as plain content.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ExperienceSources } from './ExperienceSources';
import { SearchExperienceDetail } from './SearchExperienceDetail';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/shared/ui/custom/CollapsibleCard', async () => {
  const { createElement: h } = await import('react');
  return { CollapsibleCard: ({ children }: { children?: unknown }) => h('div', null, children as never) };
});
vi.mock('../_lib/hooks', () => ({
  useSearchExperience: () => ({
    experience: {
      id: 'x', name: 'Catalog search', slug: 'catalog', description: null, isActive: true, isBuiltIn: false,
      indexes: [],
      externalSources: [{ id: 'link-1', dataSourceId: 'ds-1', dataSource: { name: 'Shop engine', provider: 'elasticsearch' } }],
      allowedOrigins: [], accessToken: 'tok',
      searchConfig: {}, aiConfig: { enabled: false, summary: { enabled: false } }, toolsConfig: {},
      createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
    },
    isLoading: false, isError: false,
    deleteExperience: async () => {}, isDeleting: false,
    updateExperience: async () => {}, isUpdating: false,
    regenerateToken: async () => {}, isRegeneratingToken: false,
  }),
}));

const sources = () => renderToStaticMarkup(createElement(ExperienceSources, {
  selectedIndexes: [{ searchIndexId: 'idx-1', role: 'primary' }],
  selectedExternal: ['ds-1'],
  indexOptions: [{ id: 'idx-1', name: 'products', displayName: 'Products', searchType: 'lexical', searchProvider: 'elasticsearch' }],
  externalOptions: [{ id: 'ds-1', name: 'Shop engine', providerLabel: 'Elasticsearch' }],
  isLoading: false,
  onAddIndex: () => {}, onRemoveIndex: () => {}, onRoleChange: () => {}, onAddExternal: () => {}, onRemoveExternal: () => {},
} as never));
const detail = () => renderToStaticMarkup(createElement(SearchExperienceDetail, { id: 'x' }));

describe("a search experience's sources (edit form)", () => {
  it('link the index, the data source and Data Sources for a role that can open them', () => {
    uiAccess.hold('search-experiences:edit', 'search-indexes:view', 'data-sources:view');
    const html = sources();
    expect(html).toContain('href="/search-indexes/idx-1"');
    expect(html).toContain('href="/data-sources/ds-1"');
    expect(html).toContain('href="/data-sources"');
  });

  it('show the same sources without links to pages the role can’t open', () => {
    uiAccess.hold('search-experiences:edit');
    const html = sources();
    expect(html).not.toContain('href="/search-indexes');
    expect(html).not.toContain('href="/data-sources');
    expect(html).toContain('Products');
    expect(html).toContain('Shop engine');
    expect(html).toContain('Data Sources');
    // the plain card keeps its layout, not the link's hover
    expect(html).not.toContain('hover:underline');
  });
});

describe("a search experience's page", () => {
  it('links an external source to its data source for a role that can open it', () => {
    uiAccess.hold('search-experiences:view', 'data-sources:view');
    expect(detail()).toContain('href="/data-sources/ds-1"');
  });

  it('shows the external source without the link to anyone else', () => {
    uiAccess.hold('search-experiences:view');
    const html = detail();
    expect(html).not.toContain('href="/data-sources/ds-1"');
    expect(html).toContain('Shop engine');
    expect(html).toContain('External index');
  });
});
