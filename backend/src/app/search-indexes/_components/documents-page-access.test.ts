// src/app/search-indexes/_components/documents-page-access.test.ts

/**
 * The Manage Documents page's Upload Documents button: locked with the reason without
 * documents:edit, and on the built-in help for anyone but an Admin.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ManageDocumentsPage from '../(pages)/[id]/documents/page';

import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }), useParams: () => ({ id: 'i' }) }));
vi.mock('./DocumentManager', () => ({ DocumentManagerPanel: () => null }));

let isBuiltIn = false;
vi.mock('../_lib/hooks/useSearchIndexes', () => ({
  useSearchIndex: () => ({
    searchIndex: { id: 'i', name: 'docs', displayName: 'Docs index', status: 'ready', documentCount: 3, isBuiltIn },
    isLoading: false, isError: false,
  }),
}));

const upload = { text: 'Upload Documents' };
const page = () => renderToStaticMarkup(createElement(ManageDocumentsPage));

describe('the Manage Documents page', () => {
  beforeEach(() => { isBuiltIn = false; });

  it('locks Upload Documents with the reason for a role without documents:edit', () => {
    uiAccess.hold('search-indexes:view', 'search-indexes:edit');
    const html = page();
    expect(controlState(html, upload)).toBe('locked');
    expect(html).toContain('You don&#x27;t have permission to upload documents.');
  });

  it('opens it for a role with documents:edit', () => {
    uiAccess.hold('search-indexes:view', 'documents:edit');
    expect(controlState(page(), upload)).toBe('open');
  });

  it('locks it on the built-in help for a non-Admin, not for an Admin', () => {
    isBuiltIn = true;
    uiAccess.hold('search-indexes:view', 'documents:edit');
    const html = page();
    expect(controlState(html, upload)).toBe('locked');
    expect(html).toContain('Only an Admin can change the built-in help.');
    uiAccess.asAdmin();
    expect(controlState(page(), upload)).toBe('open');
  });
});
