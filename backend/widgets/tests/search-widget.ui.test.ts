/**
 * Search widget UI: the modal search button names the shortcut as the visitor's keyboard
 * shows it, the search field has no browser clear (×) button or inner focus ring, and the
 * arrow keys keep working after a filter click.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchDropinUI } from '../src/search/SearchWidget';
import { searchShortcutLabel } from '../src/shared/shortcut';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Read from disk: the test setup stubs CSS imports
const widgetCss = readFileSync(path.resolve(__dirname, '../src/styles/widget.css'), 'utf8');
const flush = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const root = () => document.querySelector('[data-interakt-widget]')?.shadowRoot as ShadowRoot;
const launcher = () => root().querySelector('button[aria-label="Open search"]') as HTMLButtonElement;

describe('searchShortcutLabel', () => {
  it.each([
    [{ platform: 'MacIntel' }, '⌘K'],
    [{ platform: 'iPhone' }, '⌘K'],
    [{ platform: 'iPad' }, '⌘K'],
    [{ platform: 'Win32' }, 'Ctrl+K'],
    [{ platform: 'Linux x86_64' }, 'Ctrl+K'],
    [{ platform: '' }, 'Ctrl+K'],
    [undefined, 'Ctrl+K'],
  ])('platform %o → %s', (nav, label) => {
    expect(searchShortcutLabel(nav)).toBe(label);
  });

  it('prefers userAgentData.platform where the browser has it', () => {
    expect(searchShortcutLabel({ platform: 'Win32', userAgentData: { platform: 'macOS' } })).toBe('⌘K');
    expect(searchShortcutLabel({ platform: 'MacIntel', userAgentData: { platform: 'Windows' } })).toBe('Ctrl+K');
  });
});

describe('search widget: the modal search button', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="ik"></div>';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });
  afterEach(() => {
    SearchDropinUI.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const mount = async () => {
    SearchDropinUI.init({ containerId: 'ik', accessToken: 'token', apiBaseUrl: 'https://interakt.test', mode: 'modal' });
    await flush();
  };

  it('shows ⌘K in its tooltip on a Mac', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    await mount();
    expect(launcher().title).toBe('Search (⌘K)');
  });

  it('shows Ctrl+K in its tooltip elsewhere', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    await mount();
    expect(launcher().title).toBe('Search (Ctrl+K)');
  });

  it('declares both shortcuts for assistive technology', async () => {
    await mount();
    expect(launcher().getAttribute('aria-keyshortcuts')).toBe('Control+K Meta+K');
  });
});

describe('search widget styles', () => {
  it('hide the browser clear (×) button in the search field', () => {
    expect(widgetCss).toMatch(/\.ik-search-input::-webkit-search-cancel-button[\s\S]*?display:\s*none/);
  });

  it('show focus on the search bar, not as a ring inside the field', () => {
    expect(widgetCss).toMatch(/\.ik-search-row:focus-within\s*\{[^}]*border-bottom-color/);
    expect(widgetCss).not.toMatch(/\.ik-search-input:focus-visible/);
  });
});

describe('search widget: keyboard after a filter click', () => {
  const hits = [1, 2, 3].map((n) => ({ id: `d${n}`, score: 1, source: { title: `Doc ${n}` } }));
  const facets = [{ field: 'brand', type: 'terms', buckets: [{ key: 'Acme', count: 2 }, { key: 'Bolt', count: 1 }] }];

  beforeEach(() => {
    document.body.innerHTML = '<div id="ik"></div>';
    // jsdom has no layout: the widget scrolls the highlighted result into view
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/api/v1/search')) {
        return new Response(JSON.stringify({ success: true, data: { results: hits, total: { value: 3 }, facets } }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }));
  });
  afterEach(() => {
    SearchDropinUI.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the arrow keys working: focus returns to the search field', async () => {
    SearchDropinUI.init({ containerId: 'ik', accessToken: 'token', apiBaseUrl: 'https://interakt.test', mode: 'inline', aiSummary: false });
    await flush();
    const input = root().querySelector('input') as HTMLInputElement;
    input.value = 'doc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(400);

    (root().querySelector('.ik-chip--facet') as HTMLButtonElement).click();
    await flush(50);
    expect(root().activeElement).toBe(input);

    (root().activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await flush();
    const selected = [...root().querySelectorAll('.ik-result')].findIndex((li) => li.classList.contains('ik-result--selected'));
    expect(selected).toBe(1);
  });
});
