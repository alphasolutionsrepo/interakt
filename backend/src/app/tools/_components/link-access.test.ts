// src/app/tools/_components/link-access.test.ts

/**
 * Links from tools to other areas show only to a role that can open them: View on a chat
 * experience that uses the tool, and Data Sources in the search tool's setup.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import ToolDetailPage from '../(pages)/[id]/page';

import { SearchProviderConfig } from './CreateWizard/configs/SearchProviderConfig';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
// The data source list has loaded (empty): loading starts true and an effect would clear it
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: <T,>(initial: T) => actual.useState(initial === (true as T) ? (false as T) : initial) };
});
// The select's options render inline, as if open
vi.mock('@/components/ui/select', async () => {
  const { createElement: h } = await import('react');
  const pass = ({ children }: { children?: unknown }) => h('div', null, children as never);
  return { Select: pass, SelectContent: pass, SelectItem: pass, SelectTrigger: pass, SelectValue: () => null };
});
vi.mock('../_lib/hooks/useTools', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/hooks/useTools')>()),
  useTool: () => ({
    tool: {
      id: 't', name: 'Catalog search', slug: 'catalog-search', description: 'd', aiDescription: 'a', executorType: 'search',
      operation: 'search', config: {}, inputSchema: {}, outputSchema: {}, displayConfig: null, dataSourceId: null,
      isActive: true, isBuiltIn: false, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
    },
    isLoading: false, isError: false, updateTool: async () => {}, deleteTool: async () => {}, isUpdating: false, isDeleting: false,
    experiences: [{ id: 'e1', name: 'Shop assistant', slug: 'shop', isActive: true }], experienceCount: 1, experiencesHidden: false,
  }),
  useLookupFields: () => ({ status: undefined }),
}));

const ready = <T,>(value: T) => Object.assign(Promise.resolve(value), { status: 'fulfilled', value });
const detail = () => renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
  createElement(ToolDetailPage, { params: ready({ id: 't' }) })));
const config = () => renderToStaticMarkup(createElement(SearchProviderConfig, { value: {}, onChange: () => {} } as never));

describe("a tool's page", () => {
  it('offers View on an experience using it to a role that can open chat experiences', () => {
    uiAccess.hold('tools:view', 'ai-experiences:view');
    const html = detail();
    expect(html).toContain('Shop assistant');
    expect(html).toContain('href="/experiences/ai/e1"');
    // The link is styled as a button, not wrapped around one (a button inside a link is invalid HTML)
    expect(html).not.toMatch(/<a [^>]*href="\/experiences\/ai\/e1"[^>]*>(?:(?!<\/a>).)*<button/);
  });

  it('lists the experience without View for a role that can’t', () => {
    uiAccess.hold('tools:view');
    const html = detail();
    expect(html).toContain('Shop assistant');
    expect(html).not.toContain('href="/experiences/ai/e1"');
  });
});

describe("the search tool's setup", () => {
  it('links to Data Sources and to creating one for a role that can open them', () => {
    uiAccess.hold('tools:edit', 'data-sources:view', 'data-sources:edit');
    const html = config();
    expect(html).toContain('href="/data-sources"');
    expect(html).toContain('href="/data-sources/create"');
  });

  it('names Data Sources without links for a role that can’t open them', () => {
    uiAccess.hold('tools:edit');
    const html = config();
    expect(html).not.toContain('href="/data-sources');
    expect(html).toContain('Data Sources');
    expect(html).toContain('No active data sources found.');
    expect(html).not.toMatch(/found\.\s*(<!-- -->)?\s*\./); // no stray period where the link was
  });
});
