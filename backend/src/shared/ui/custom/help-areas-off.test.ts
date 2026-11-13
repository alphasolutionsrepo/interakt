// src/shared/ui/custom/help-areas-off.test.ts

/**
 * The help drawer with the Help assistant off: no Search | Ask AI switch and no "Ask AI about
 * ... instead" row, so only the docs search is left; both are there while it is on.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DocsSearchResults } from './DocsSearchResults';
import { HelpButton, ModeSwitch, docsSearchRoutable, effectiveHelpMode, helpDescription, helpTriggerTooltip, noHelpHint } from './HelpButton';

import { uiAccess, uiAccessLoading } from '@/shared/test/ui-access-stub';

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

describe('the help drawer while access is loading', () => {
  const trigger = () => renderToStaticMarkup(createElement(HelpButton));

  it('renders no mode switch, in neither state', () => {
    uiAccessLoading();
    expect(modes()).toBe('');
  });

  it('says nothing about asking on the trigger until access has loaded', () => {
    uiAccessLoading();
    const html = trigger();
    expect(html).toContain('aria-label="Help"');
    expect(html).not.toMatch(/ask/i);
  });

  it('shows the Ask wording once loaded with the Help assistant on, and not with it off', () => {
    uiAccess.asAdmin();
    expect(trigger()).toContain('aria-label="Help, search and ask"');
    expect(modes()).toContain('radiogroup');
    uiAccess.asAdmin();
    uiAccess.areasOff('help-assistant');
    expect(trigger()).toContain('aria-label="Help and search"');
    expect(modes()).toBe('');
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

describe('the help drawer’s own mode decision', () => {
  it('forces Search when the Help assistant is off, even if Ask AI was remembered', () => {
    expect(effectiveHelpMode('ask', false)).toBe('search');
    expect(effectiveHelpMode('search', false)).toBe('search');
  });

  it('keeps the remembered mode while the Help assistant is on', () => {
    expect(effectiveHelpMode('ask', true)).toBe('ask');
    expect(effectiveHelpMode('search', true)).toBe('search');
  });

  it('describes only the docs search when the Help assistant is off', () => {
    expect(helpDescription(false)).toBe('Search the docs.');
    expect(helpDescription(true)).toBe('Search the docs, or ask the Help Assistant.');
  });
});

describe('the help button and drawer wording', () => {
  const button = () => renderToStaticMarkup(createElement(HelpButton));

  it('mentions asking on the trigger while the Help assistant is on', () => {
    uiAccess.asAdmin();
    expect(button()).toContain('Help, search and ask');
  });

  it('speaks of search only on the trigger with the Help assistant off', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('help-assistant');
    const html = button();
    expect(html).toContain('aria-label="Help and search"');
    expect(html.toLowerCase()).not.toMatch(/\bask/);
  });

  it('keeps asking out of the tooltip and the empty-state hint with the Help assistant off', () => {
    expect(helpTriggerTooltip(false).toLowerCase()).not.toContain('ask');
    expect(noHelpHint(false).toLowerCase()).not.toContain('ask');
    expect(helpTriggerTooltip(true)).toContain('ask');
    expect(noHelpHint(true)).toContain('ask a question');
  });
});

describe('the docs search route', () => {
  it('is not called with the Help assistant off, and is while on or still loading', () => {
    expect(docsSearchRoutable(false)).toBe(false);
    expect(docsSearchRoutable(true)).toBe(true);
    expect(docsSearchRoutable(null)).toBe(true);
  });
});
