/**
 * Search widget UI: the modal search button names the shortcut as the visitor's keyboard
 * shows it, the search field has no browser clear (×) button or inner focus ring, the
 * arrow keys keep working after a filter click, and a long summary scrolls with the results.
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
const MODES = ['inline', 'modal'] as const;
/** Mounts the widget in a mode; a modal is opened, as a visitor would. */
const mountIn = async (mode: (typeof MODES)[number], extra: Record<string, unknown> = {}) => {
  SearchDropinUI.init({ containerId: 'ik', accessToken: 'token', apiBaseUrl: 'https://interakt.test', mode, ...extra } as Parameters<typeof SearchDropinUI.init>[0]);
  await flush();
  if (mode === 'modal') {
    launcher().click();
    await flush();
  }
};

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

describe('SearchDropinUI.shortcutLabel', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([['MacIntel', '⌘K'], ['Win32', 'Ctrl+K']])('on %s is %s', (platform, label) => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
    expect(SearchDropinUI.shortcutLabel()).toBe(label);
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

  it.each(MODES)('%s: pressed from the keyboard, focus stays on the chip so tabbing continues', async (mode) => {
    await mountIn(mode, { aiSummary: false });
    const input = root().querySelector('input') as HTMLInputElement;
    input.value = 'doc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(400);

    const chip = root().querySelector('.ik-chip--facet') as HTMLButtonElement;
    chip.focus();
    chip.click(); // Enter or Space on a button: a click with detail 0
    await flush(50);
    expect(root().activeElement).toBe(chip);
  });

  it.each(MODES)('%s: keeps the arrow keys working: focus returns to the search field', async (mode) => {
    await mountIn(mode, { aiSummary: false });
    const input = root().querySelector('input') as HTMLInputElement;
    input.value = 'doc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(400);

    // A mouse click (detail 1), not a keyboard press
    root().querySelector('.ik-chip--facet')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await flush(50);
    expect(root().activeElement).toBe(input);

    (root().activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await flush();
    const selected = [...root().querySelectorAll('.ik-result')].findIndex((li) => li.classList.contains('ik-result--selected'));
    expect(selected).toBe(1);
  });
});

describe('search widget: a long summary never hides the results', () => {
  const hits = [1, 2, 3].map((n) => ({ id: `d${n}`, score: 1, source: { title: `Doc ${n}` } }));
  const encoder = new TextEncoder();
  let scrolledTo: Element[] = [];

  beforeEach(() => {
    document.body.innerHTML = '<div id="ik"></div>';
    scrolledTo = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) { scrolledTo.push(this); });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/api/v1/search')) {
        return new Response(JSON.stringify({ success: true, data: { results: hits, total: { value: 3 } } }), { status: 200 });
      }
      if (url.endsWith('/api/v1/summarize')) {
        const stream = new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', text: 'A long summary' })}\n\n`));
            c.close();
          },
        });
        return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }
      return new Response('{}', { status: 200 });
    }));
  });
  afterEach(() => {
    SearchDropinUI.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const search = async (mode: (typeof MODES)[number] = 'inline') => {
    await mountIn(mode);
    const input = root().querySelector('input') as HTMLInputElement;
    input.value = 'doc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(1500);
    return input;
  };
  const press = async (input: HTMLInputElement, key: string) => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await flush();
  };

  it.each(MODES)('%s: the summary and the results scroll as one area', async (mode) => {
    await search(mode);
    const body = root().querySelector('.ik-search-body')!;
    expect(body.querySelector('.ik-summary')).not.toBeNull();
    expect(body.querySelector('.ik-results')).not.toBeNull();
  });

  it.each(MODES)('%s: moving down scrolls the newly highlighted result into view, not the one before', async (mode) => {
    const input = await search(mode);
    await press(input, 'ArrowDown');
    await press(input, 'ArrowDown');
    const rows = [...root().querySelectorAll('.ik-result')];
    expect(scrolledTo).toEqual([rows[1], rows[2]]);
  });

  it.each(MODES)('%s: back on the first result, the summary above it shows again', async (mode) => {
    const input = await search(mode);
    const body = root().querySelector('.ik-search-body') as HTMLElement;
    await press(input, 'ArrowDown');
    body.scrollTop = 200;
    await press(input, 'ArrowUp');
    expect(body.scrollTop).toBe(0);
  });

  it('Up on the first result, or Down on the last, leaves the area where the visitor scrolled it', async () => {
    const input = await search();
    const body = root().querySelector('.ik-search-body') as HTMLElement;
    body.scrollTop = 200;
    await press(input, 'ArrowUp'); // already on the first result
    expect(body.scrollTop).toBe(200);

    await press(input, 'ArrowDown');
    await press(input, 'ArrowDown'); // now on the last of three
    scrolledTo = [];
    await press(input, 'ArrowDown');
    expect(scrolledTo).toEqual([]);
  });
});
