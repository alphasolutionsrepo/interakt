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

import { uiAccess } from '@/shared/test/ui-access-stub';
import { DangerZone } from '@/shared/ui/custom/DangerZone';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@/components/ui/dropdown-menu', async () => (await import('@/shared/test/open-overlays-stub')).dropdownMenu);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

const noop = () => {};
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, el));

/** Each menu item as "label" or "label (locked)" */
const menuItems = (html: string) => [...html.matchAll(/<button[^>]*role="menuitem"([^>]*)>(.*?)<\/button>/g)]
  .map(([, attrs, inner]) => `${inner.replace(/<[^>]+>/g, '')}${attrs.includes('disabled') && inner.includes('lucide-lock') ? ' (locked)' : ''}`);
/** Whether a button with this text is locked (inside the hint, disabled, with the lock icon) */
const locked = (html: string, text: string) =>
  [...html.matchAll(/<span[^>]*data-locked=""[^>]*>(<button[^>]*>)(.*?)<\/button>/g)]
    .some(([, tag, inner]) => tag.includes('disabled=""') && inner.includes('lucide-lock') && inner.includes(text));

const menu = (status = 'active') => render(createElement(IndexRowMenu, {
  index: { status } as never, onView: noop, onEdit: noop, onDelete: noop, triggerClassName: '', itemClassName: '',
}));

describe('index menu (card and table views)', () => {
  beforeEach(() => uiAccess.hold('search-indexes:view'));

  it('locks every change for a viewer, keeping View Details', () => {
    expect(menuItems(menu())).toEqual(['View Details', 'Edit (locked)', 'Reindex (locked)', 'Delete (locked)']);
  });

  it('separates index changes from document changes', () => {
    uiAccess.hold('search-indexes:view', 'search-indexes:edit');
    expect(menuItems(menu())).toEqual(['View Details', 'Edit', 'Reindex (locked)', 'Delete']);
    uiAccess.hold('search-indexes:view', 'documents:edit');
    expect(menuItems(menu())).toEqual(['View Details', 'Edit (locked)', 'Reindex', 'Delete (locked)']);
  });

  it('still waits for a running job before a reindex, without the lock', () => {
    uiAccess.hold('search-indexes:view', 'documents:edit');
    const html = menu('indexing');
    expect(html).toMatch(/role="menuitem" disabled="">(?:(?!lucide-lock).)*Reindex<\/button>/);
  });
});

describe('index page parts', () => {
  beforeEach(() => uiAccess.hold('search-indexes:view'));

  it('locks Import for a viewer and allows it with search-indexes:edit', () => {
    expect(locked(render(createElement(ExportImportButtons, { importOnly: true })), 'Import')).toBe(true);
    uiAccess.hold('search-indexes:view', 'search-indexes:edit');
    expect(locked(render(createElement(ExportImportButtons, { importOnly: true })), 'Import')).toBe(false);
  });

  it('locks Configure Fields for a viewer', () => {
    const card = () => render(createElement(FieldMappingsCard, { searchIndexId: 'i', summary: null, isLoading: false }));
    expect(locked(card(), 'Configure Fields')).toBe(true);
    uiAccess.hold('search-indexes:view', 'search-indexes:edit');
    expect(locked(card(), 'Configure Fields')).toBe(false);
  });

  it("locks the Danger Zone's Delete with the reason", () => {
    const zone = () => render(createElement(DangerZone, { thing: 'search index', detail: 'Gone for good.', action: 'search-indexes.delete', onDelete: noop }));
    expect(locked(zone(), 'Delete')).toBe(true);
    expect(zone()).toContain('You don&#x27;t have permission to delete search indexes.');
    expect(zone()).toContain('Delete this search index');
    uiAccess.hold('search-indexes:edit');
    expect(locked(zone(), 'Delete')).toBe(false);
  });
});
