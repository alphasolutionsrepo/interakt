// src/app/search-indexes/_components/access.test.ts

/**
 * Search indexes and their documents: a user who can only view them sees every change locked
 * with the reason. Index changes need search-indexes:edit; document changes (upload, delete,
 * reindex) need documents:edit, so a role can hold one without the other.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExportImportButtons } from './ExportImportButtons';
import { FieldMappingsCard } from './FieldMappingsCard';
import { IndexRowMenu } from './IndexRowMenu';

import { controlState, menuItems } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';
import { DangerZone } from '@/shared/ui/custom/DangerZone';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@/components/ui/dropdown-menu', async () => (await import('@/shared/test/open-overlays-stub')).dropdownMenu);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

const noop = () => {};
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, el));


const menu = (status = 'active', isBuiltIn = false) => render(createElement(IndexRowMenu, {
  index: { status, isBuiltIn } as never, onView: noop, onEdit: noop, onDelete: noop, triggerClassName: '', itemClassName: '',
}));

describe('index menu (card and table views)', () => {
  beforeEach(() => uiAccess.hold('search-indexes:view'));

  it('locks every change for a viewer, keeping View Details', () => {
    expect(menuItems(menu())).toEqual(['View Details', 'Edit (locked)', 'Delete (locked)']);
  });

  it('opens Edit and Delete with search-indexes:edit; reindexing is on the index page', () => {
    uiAccess.hold('search-indexes:view', 'search-indexes:edit');
    expect(menuItems(menu())).toEqual(['View Details', 'Edit', 'Delete']);
  });
});

describe('the built-in docs index', () => {
  it('locks every change for an index and document editor who is not an Admin', () => {
    uiAccess.hold('search-indexes:view', 'search-indexes:edit', 'documents:edit');
    expect(menuItems(menu('active', true))).toEqual(['View Details', 'Edit (locked)', 'Delete (locked)']);
    const card = render(createElement(FieldMappingsCard, { searchIndexId: 'i', summary: null, isLoading: false, builtIn: true }));
    expect(controlState(card, { text: 'Configure Fields' })).toBe('locked');
    expect(card).toContain('Only an Admin can change the built-in help.');
  });
});

describe('index page parts', () => {
  beforeEach(() => uiAccess.hold('search-indexes:view'));

  it('locks Import for a viewer and allows it with search-indexes:edit', () => {
    expect((controlState(render(createElement(ExportImportButtons, { importOnly: true })), { text: 'Import' }) === 'locked')).toBe(true);
    uiAccess.hold('search-indexes:view', 'search-indexes:edit');
    expect((controlState(render(createElement(ExportImportButtons, { importOnly: true })), { text: 'Import' }) === 'locked')).toBe(false);
  });

  it('locks Configure Fields for a viewer', () => {
    const card = () => render(createElement(FieldMappingsCard, { searchIndexId: 'i', summary: null, isLoading: false }));
    expect((controlState(card(), { text: 'Configure Fields' }) === 'locked')).toBe(true);
    uiAccess.hold('search-indexes:view', 'search-indexes:edit');
    expect((controlState(card(), { text: 'Configure Fields' }) === 'locked')).toBe(false);
  });

  it("locks the Danger Zone's Delete with the reason", () => {
    const zone = () => render(createElement(DangerZone, { thing: 'search index', detail: 'Gone for good.', action: 'search-indexes.delete', onDelete: noop, builtIn: false }));
    expect((controlState(zone(), { text: 'Delete' }) === 'locked')).toBe(true);
    expect(zone()).toContain('You don&#x27;t have permission to delete search indexes.');
    expect(zone()).toContain('Delete this search index');
    uiAccess.hold('search-indexes:edit');
    expect((controlState(zone(), { text: 'Delete' }) === 'locked')).toBe(false);
  });
});
