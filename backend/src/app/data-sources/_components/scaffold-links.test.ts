// src/app/data-sources/_components/scaffold-links.test.ts

/**
 * The tools just scaffolded for a data source: the links to them and "View All Tools" show only
 * when /tools can be opened (tools:view and Chat on); otherwise the names stay as plain text.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ScaffoldResult } from './ScaffoldResult';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

const result = {
  created: [{ id: 't1', name: 'Search docs', slug: 'search-docs', operation: 'search' }],
  skipped: [],
};
const html = () => renderToStaticMarkup(createElement(ScaffoldResult, { result, onViewAll: () => {} }));

describe('the scaffolded tools of a data source', () => {
  it('links to each tool and to all tools with Chat on and tools:view', () => {
    uiAccess.hold('data-sources:view', 'tools:view');
    const out = html();
    expect(out).toContain('href="/tools/t1"');
    expect(out).toContain('View All Tools');
    expect(out).toContain('Search docs');
  });

  it('keeps the names but no links with Chat off, even for an Admin', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('chat');
    const out = html();
    expect(out).not.toContain('href="/tools');
    expect(out).not.toContain('View All Tools');
    expect(out).toContain('Search docs');
  });

  it('keeps the names but no links without tools:view', () => {
    uiAccess.hold('data-sources:view');
    const out = html();
    expect(out).not.toContain('href="/tools');
    expect(out).not.toContain('View All Tools');
    expect(out).toContain('Search docs');
  });
});
