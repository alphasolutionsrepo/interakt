// src/shared/ui/custom/help-loading-and-footer.test.ts

/** The help drawer keeps its remembered mode while access loads, and its footer names the Help assistant when it is off. */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DocsSearchResults } from './DocsSearchResults';
import { effectiveHelpMode } from './HelpButton';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: () => {} }) }));

const footer = (turnedOff: boolean) =>
  renderToStaticMarkup(
    createElement(DocsSearchResults, {
      query: 'sync', group: null, onGroupChange: () => {}, selected: 0, onHover: () => {}, onOpen: () => {}, onAsk: () => {},
      search: { status: 'ready', hits: [], groups: [], tookMs: null, fallback: true, turnedOff },
    }),
  );

describe('the drawer mode while access loads', () => {
  it('keeps the remembered mode while it is unknown whether the Help assistant is on', () => {
    expect(effectiveHelpMode('ask', null)).toBe('ask');
    expect(effectiveHelpMode('search', null)).toBe('search');
  });
});

describe('the title-matching footer', () => {
  it('says the Help assistant is off, and that results come from page titles', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('help-assistant');
    const html = footer(true);
    expect(html).toContain('Help assistant is turned off for this installation.');
    expect(html).toContain('Results match page titles only.');
    expect(html).not.toContain('full-text docs search is');
  });

  it('still says the search is being set up when that is the reason', () => {
    uiAccess.asAdmin();
    expect(footer(false)).toContain('still being set up');
  });
});
