// src/shared/ui/custom/help-areas-off.test.ts

/**
 * The help drawer with the Help assistant off: no Search | Ask AI switch and no "Ask AI about
 * ... instead" row, so only the docs search is left; both are there while it is on.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DocsSearchResults } from './DocsSearchResults';
import { ModeSwitch } from './HelpButton';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: () => {} }) }));

const modes = () => renderToStaticMarkup(createElement(ModeSwitch, { mode: 'search', onChange: () => {} }));
const results = () =>
  renderToStaticMarkup(
    createElement(DocsSearchResults, {
      query: 'sync', group: null, onGroupChange: () => {}, selected: 0, onHover: () => {}, onOpen: () => {}, onAsk: () => {},
      search: { status: 'ready', hits: [], groups: [], tookMs: 3, fallback: false, turnedOff: false },
    }),
  );

describe('the help drawer modes', () => {
  it('offers Search and Ask AI while the Help assistant is on', () => {
    uiAccess.asAdmin();
    const html = modes();
    expect(html).toContain('Search');
    expect(html).toContain('Ask AI');
  });

  it('has no Ask AI tab, and no switch at all, with the Help assistant off', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('help-assistant');
    const html = modes();
    expect(html).not.toContain('Ask AI');
    expect(html).not.toContain('radiogroup');
  });
});

describe('the docs search results', () => {
  it('end with "Ask AI about ... instead" while the Help assistant is on', () => {
    uiAccess.asAdmin();
    expect(results()).toContain('Ask AI about');
  });

  it('leave that row out with the Help assistant off', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('help-assistant');
    const html = results();
    expect(html).not.toContain('Ask AI about');
    expect(html).toContain('No docs match');
  });
});
