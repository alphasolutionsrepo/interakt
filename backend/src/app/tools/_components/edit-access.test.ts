// src/app/tools/_components/edit-access.test.ts

/**
 * A tool's edit page: only an Admin changes the built-in help, so anyone else opening a built-in
 * tool's edit page is told why and linked back, instead of given a form whose save the server
 * would refuse. An Admin, or an editor on any other tool, gets the form.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EditToolPage from '../(pages)/[id]/edit/page';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

let isBuiltIn = false;
vi.mock('../_lib/hooks/useTools', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/hooks/useTools')>()),
  useTool: () => ({
    tool: {
      id: 't', name: 'Docs search', slug: 'docs-search', description: 'd', aiDescription: 'a', executorType: 'search',
      operation: 'search', config: {}, inputSchema: {}, outputSchema: {}, displayConfig: null, dataSourceId: null,
      isActive: true, isBuiltIn, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
    },
    isLoading: false, updateTool: async () => {},
  }),
  useLookupFields: () => ({ status: 'idle', fields: [] }),
}));

/** A promise React's use() reads at once */
const ready = <T,>(value: T) => Object.assign(Promise.resolve(value), { status: 'fulfilled', value });
const page = () => renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
  createElement(EditToolPage, { params: ready({ id: 't' }) })));

describe("a built-in tool's edit page", () => {
  beforeEach(() => { isBuiltIn = true; });

  it('tells an editor who is not an Admin why, with no form to save', () => {
    uiAccess.hold('tools:view', 'tools:edit');
    const html = page();
    expect(html).toContain('You can&#x27;t change this');
    expect(html).toContain('Only an Admin can change the built-in help.');
    expect(html).toContain('href="/tools/t"');
    expect(html).not.toContain('Save Changes');
  });

  it('is the form for an Admin', () => {
    uiAccess.asAdmin();
    const html = page();
    expect(html).toContain('Edit Docs search');
    expect(html).toContain('Save Changes');
    expect(html).not.toContain('You can&#x27;t change this');
  });

  it('is the form for an editor on any other tool', () => {
    isBuiltIn = false;
    uiAccess.hold('tools:view', 'tools:edit');
    const html = page();
    expect(html).toContain('Save Changes');
    expect(html).not.toContain('You can&#x27;t change this');
  });
});
