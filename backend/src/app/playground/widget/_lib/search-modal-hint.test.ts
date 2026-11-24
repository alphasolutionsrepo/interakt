import { describe, expect, it } from 'vitest';

import { SEARCH_MODAL_HINT_SCRIPT, searchModalHintHtml } from './search-modal-hint';

/** Runs the hint's script in a fake preview page, fires load, and returns the shortcut it shows. */
function shownShortcut(widget?: { shortcutLabel?: () => string }): string {
  const kbd = { textContent: 'Ctrl+K' };
  let onLoad: (() => void) | undefined;
  const window = {
    SearchDropinUI: widget,
    addEventListener: (type: string, fn: () => void) => { if (type === 'load') onLoad = fn; },
  };
  const document = { querySelectorAll: (sel: string) => (sel === '[data-shortcut]' ? [kbd] : []) };
  new Function('window', 'document', SEARCH_MODAL_HINT_SCRIPT)(window, document);
  onLoad?.();
  return kbd.textContent;
}

describe('playground search modal hint', () => {
  it('names the search button and, until the widget loads, Ctrl+K', () => {
    const html = searchModalHintHtml();
    expect(html).toContain('Click the search button (bottom right)');
    expect(html).toContain('<kbd data-shortcut>Ctrl+K</kbd>');
    expect(html).toContain(`<script>${SEARCH_MODAL_HINT_SCRIPT}</script>`);
  });

  it("shows the widget's own label once it has loaded", () => {
    expect(shownShortcut({ shortcutLabel: () => '⌘K' })).toBe('⌘K');
    expect(shownShortcut({ shortcutLabel: () => 'Ctrl+K' })).toBe('Ctrl+K');
  });

  it('keeps Ctrl+K when the widget is missing or older', () => {
    expect(shownShortcut(undefined)).toBe('Ctrl+K');
    expect(shownShortcut({})).toBe('Ctrl+K');
  });
});
