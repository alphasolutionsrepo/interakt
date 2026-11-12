// src/app/search-indexes/_components/documents-access.test.ts

/**
 * The document manager: deleting one document (from the browse list or the lookup) and the
 * delete-by-filter buttons are document changes, locked with the reason without documents:edit,
 * and on the built-in help for anyone but an Admin.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentManagerPanel } from './DocumentManager';

import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

// The panel starts with a document open in the browse list and in the lookup, which a click and a
// submit do in the browser. With no DOM, the starting values of its four null states are chosen
// by order: the open row, the pending delete, the looked-up id, the filter preview.
const nullStarts: unknown[] = ['doc-1', null, 'doc-1', null];
let nullsSeen = 0;
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: <T,>(initial: T) => actual.useState(initial === (null as T) ? (nullStarts[nullsSeen++ % nullStarts.length] as T) : initial) };
});

const mutation = { mutateAsync: async () => {}, isPending: false };
vi.mock('../_lib/hooks', () => ({
  useBrowseDocuments: () => ({
    data: {
      documents: [{ id: 'doc-1', fields: { title: 'A' } }], columns: [{ key: 'title', label: 'Title', kind: 'text' }],
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
    },
    isLoading: false, isError: false, error: null,
  }),
  useDocument: () => ({ data: { documentId: 'doc-1', document: { title: 'A' } }, isLoading: false, error: null }),
  useDeleteDocument: () => mutation,
  useDeleteDocumentsByFilter: () => mutation,
  useSearchIndexFields: () => ({ data: [] }),
}));

const panel = (builtIn = false) => {
  nullsSeen = 0;
  return renderToStaticMarkup(createElement(DocumentManagerPanel, { searchIndexId: 'i', builtIn }));
};
const REASON = 'You don&#x27;t have permission to edit or delete documents.';
/** Every document change in the panel: browse row, lookup, and the two delete-by-filter buttons */
const deleteDocument = (html: string) => [...html.matchAll(/<button[^>]*>(?:(?!<\/button>).)*Delete document<\/button>/g)].length;

describe('the document manager', () => {
  beforeEach(() => uiAccess.hold('search-indexes:view', 'search-indexes:edit'));

  it('shows a delete for the open document in the list and in the lookup', () => {
    expect(deleteDocument(panel())).toBe(2);
  });

  it('locks every document change with the reason for a role without documents:edit', () => {
    const html = panel();
    expect(controlState(html, { text: 'Delete document' })).toBe('locked');
    expect(controlState(html, { text: 'Preview matches' })).toBe('locked');
    expect(controlState(html, { text: 'Delete matches' })).toBe('locked');
    expect(html).toContain(REASON);
    // both Delete document buttons, not just the first
    expect(html.split(REASON).length - 1).toBe(4);
  });

  it('does not lock them for a role with documents:edit', () => {
    uiAccess.hold('search-indexes:view', 'documents:edit');
    const html = panel();
    expect(controlState(html, { text: 'Delete document' })).toBe('open');
    expect(controlState(html, { text: 'Preview matches' })).not.toBe('locked');
    expect(controlState(html, { text: 'Delete matches' })).not.toBe('locked');
    expect(html).not.toContain(REASON);
  });

  it('locks them on the built-in help for a documents editor who is not an Admin, not for an Admin', () => {
    uiAccess.hold('search-indexes:view', 'documents:edit');
    const html = panel(true);
    expect(html.split('Only an Admin can change the built-in help.').length - 1).toBe(4);
    uiAccess.asAdmin();
    expect(panel(true)).not.toContain('Only an Admin can change the built-in help.');
  });
});
