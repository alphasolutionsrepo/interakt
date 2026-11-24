import { describe, expect, it } from 'vitest';

import { SEARCH_MODAL_HINT_SCRIPT, searchModalHintHtml } from './search-modal-hint';

/** Runs the hint's script against a fake page and browser, and returns the shortcut it shows. */
function shownShortcut(nav: { platform?: string; userAgentData?: { platform?: string } }): string {
  const kbd = { textContent: 'Ctrl K' };
  const document = { querySelectorAll: (sel: string) => (sel === '[data-shortcut]' ? [kbd] : []) };
  new Function('navigator', 'document', SEARCH_MODAL_HINT_SCRIPT)(nav, document);
  return kbd.textContent;
}

describe('playground search modal hint', () => {
  it('names the search button and, by default, Ctrl K', () => {
    const html = searchModalHintHtml();
    expect(html).toContain('Click the search button (bottom right)');
    expect(html).toContain('<kbd data-shortcut>Ctrl K</kbd>');
    expect(html).toContain(`<script>${SEARCH_MODAL_HINT_SCRIPT}</script>`);
  });

  it.each([
    [{ platform: 'MacIntel' }, '⌘ K'],
    [{ platform: 'iPad' }, '⌘ K'],
    [{ platform: 'Win32' }, 'Ctrl K'],
    [{ platform: 'Linux x86_64' }, 'Ctrl K'],
    [{}, 'Ctrl K'],
    [{ platform: 'Win32', userAgentData: { platform: 'macOS' } }, '⌘ K'],
  ])('on %o shows %s', (nav, expected) => {
    expect(shownShortcut(nav)).toBe(expected);
  });
});
