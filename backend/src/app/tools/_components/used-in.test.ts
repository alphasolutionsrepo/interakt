// src/app/tools/_components/used-in.test.ts

/**
 * A tool's page shows where the tool is used: the "Used In" stat and the "Used in AI
 * Experiences" card, read through the real hook from what GET /api/tools/:id/experiences
 * answers (the cache is seeded with that answer; nothing is mocked in the hook).
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import ToolDetailPage from '../(pages)/[id]/page';
import { toolKeys } from '../_lib/hooks/useTools';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

const tool = {
  id: 't', name: 'Catalog search', slug: 'catalog-search', description: 'd', aiDescription: 'a', executorType: 'data_source',
  operation: 'search', config: {}, inputSchema: {}, outputSchema: {}, displayConfig: null, dataSourceId: null,
  isActive: true, isBuiltIn: false, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
};
const ready = <T,>(value: T) => Object.assign(Promise.resolve(value), { status: 'fulfilled', value });
const detail = (answer: unknown) => {
  const client = new QueryClient();
  client.setQueryData(toolKeys.detail('t'), tool);
  client.setQueryData(toolKeys.experiences('t'), answer);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(ToolDetailPage, { params: ready({ id: 't' }) })));
};

describe("a tool's page", () => {
  it('shows the experiences using the tool, and the count in "Used In"', () => {
    uiAccess.hold('tools:view', 'ai-experiences:view');
    const html = detail({
      toolId: 't', experienceCount: 2,
      experiences: [{ id: 'e1', name: 'Shop assistant', slug: 'shop', isActive: true }, { id: 'e2', name: 'Help desk', slug: 'help', isActive: false }],
    });
    expect(html).toContain('Used in AI Experiences');
    expect(html).toContain('Shop assistant');
    expect(html).toContain('Help desk');
    expect(html).toContain('href="/experiences/ai/e1"');
    expect(html).toContain('2 experiences use this tool.');
  });

  it('shows no card for a tool nothing uses', () => {
    uiAccess.hold('tools:view', 'ai-experiences:view');
    const html = detail({ toolId: 't', experienceCount: 0, experiences: [] });
    expect(html).not.toContain('Used in AI Experiences');
  });
});
