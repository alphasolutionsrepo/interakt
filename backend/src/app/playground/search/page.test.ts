// app/playground/search/page.test.ts

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SearchPlaygroundPage from './page';

import { uiAccess, uiAccessLoading } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('./_components/SearchPlayground', () => ({ SearchPlayground: () => createElement('div', { 'data-marker': 'index-tab' }) }));
vi.mock('next/dynamic', () => ({ default: () => () => createElement('div', { 'data-marker': 'experience-tab' }) }));

const render = () => renderToStaticMarkup(createElement(SearchPlaygroundPage));
const tabButton = (html: string, label: string) => html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}</button>`))![0];

describe('Search Test page tabs', () => {
  beforeEach(() => uiAccess.asAdmin());

  it('opens on Index Search with everything on', () => {
    const html = render();
    expect(html).toContain('data-marker="index-tab"');
    expect(html).not.toContain('data-marker="experience-tab"');
    expect(tabButton(html, 'Index Search')).not.toContain('disabled');
  });

  it('opens on Experience Search with Managed indexes off, the index tab disabled with the reason, and no index playground', () => {
    uiAccess.areasOff('managed-indexes');
    const html = render();
    expect(html).toContain('data-marker="experience-tab"');
    expect(html).not.toContain('data-marker="index-tab"');
    const index = tabButton(html, 'Index Search');
    expect(index).toContain('disabled');
    expect(index).toContain('Managed indexes is turned off for this installation.');
    expect(html).toContain('role="note"');
    expect(tabButton(html, 'Experience Search')).not.toContain('disabled');
  });

  it('keeps Index Search with Search off, the experience tab disabled with the reason', () => {
    uiAccess.areasOff('search');
    const html = render();
    expect(html).toContain('data-marker="index-tab"');
    expect(tabButton(html, 'Experience Search')).toContain('disabled');
    expect(tabButton(html, 'Experience Search')).toContain('Search is turned off for this installation.');
  });

  it('renders no tab content and locks nothing while access loads', () => {
    uiAccessLoading();
    const html = render();
    expect(html).not.toContain('data-marker');
    expect(html).not.toContain('disabled');
  });
});
