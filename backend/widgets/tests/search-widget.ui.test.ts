/**
 * Search widget UI: the modal search button names the shortcut as the visitor's keyboard
 * shows it, the search field has no browser clear (×) button or inner focus ring, the
 * arrow keys keep working after a filter click, and a long summary scrolls with the results.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchDropinUI } from '../src/search/SearchWidget';
import { searchShortcutLabel } from '../src/shared/shortcut';
import { isMouseClick } from '../src/shared/pointer';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Read from disk: the test setup stubs CSS imports
const widgetCss = readFileSync(path.resolve(__dirname, '../src/styles/widget.css'), 'utf8');
/** A click as a browser sends it from a pointer of this type. */
const pointerClick = (el: Element, pointerType: string) => {
  const e = new MouseEvent('click', { bubbles: true, detail: 1 });
  Object.defineProperty(e, 'pointerType', { value: pointerType });
  el.dispatchEvent(e);
};
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

describe('search widget: the open shortcut', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="ik"></div>';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });
  afterEach(() => {
    SearchDropinUI.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([['⌘K', { metaKey: true }], ['Ctrl+K', { ctrlKey: true }]])('%s opens the modal search', async (_name, mods) => {
    SearchDropinUI.init({ containerId: 'ik', accessToken: 'token', apiBaseUrl: 'https://interakt.test', mode: 'modal' });
    await flush();
    expect(root().querySelector('input')).toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ...mods }));
    // Wait for the render rather than a fixed delay: steady under a loaded test run
    await vi.waitFor(() => expect(root().querySelector('input')).not.toBeNull(), { timeout: 2000 });
  });

  it('K alone does not open it', async () => {
    SearchDropinUI.init({ containerId: 'ik', accessToken: 'token', apiBaseUrl: 'https://interakt.test', mode: 'modal' });
    await flush();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    await flush();
    expect(root().querySelector('input')).toBeNull();
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
    // Only the text field: not the close or clear button in the same row
    // A 2px line in the full accent colour (focus indicator contrast)
    expect(widgetCss).toMatch(/\.ik-search-row:has\(\.ik-search-input:focus\)\s*\{[^}]*box-shadow:\s*inset 0 -2px 0 var\(--ik-primary\)/);
    // …with a fallback for browsers without :has(), inside @supports only
    expect(widgetCss).toMatch(/@supports not selector\(:has\(\*\)\)\s*\{\s*\.ik-search-row:focus-within/);
    expect(widgetCss.match(/\.ik-search-row:focus-within/g)).toHaveLength(1);
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

  it.each(MODES)('%s: a tap leaves focus off the field, so no on-screen keyboard opens', async (mode) => {
    await mountIn(mode, { aiSummary: false });
    const input = root().querySelector('input') as HTMLInputElement;
    input.value = 'doc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(400);
    input.blur();

    pointerClick(root().querySelector('.ik-chip--facet')!, 'touch');
    await flush(50);
    expect(root().activeElement).not.toBe(input);
  });

  it('clicking the active chip again clears the filter and returns focus', async () => {
    await mountIn('inline', { aiSummary: false });
    const input = root().querySelector('input') as HTMLInputElement;
    input.value = 'doc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(400);
    const chip = () => root().querySelector('.ik-chip--facet') as HTMLButtonElement;

    pointerClick(chip(), 'mouse');
    await flush(50);
    expect(chip().getAttribute('aria-pressed')).toBe('true');
    pointerClick(chip(), 'mouse');
    await flush(50);
    expect(chip().getAttribute('aria-pressed')).toBe('false');
    const lastSearch = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls
      .filter(([url]) => url.endsWith('/api/v1/search')).at(-1)!;
    expect(JSON.parse(String(lastSearch[1].body)).filters).toBeUndefined();
    expect(root().activeElement).toBe(input);
  });

  it.each(MODES)('%s: keeps the arrow keys working: focus returns to the search field', async (mode) => {
    await mountIn(mode, { aiSummary: false });
    const input = root().querySelector('input') as HTMLInputElement;
    input.value = 'doc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(400);

    pointerClick(root().querySelector('.ik-chip--facet')!, 'mouse');
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

  it('inline: back on the first result brings the summary into view (the page scrolls, not the area)', async () => {
    const input = await search('inline');
    await press(input, 'ArrowDown');
    scrolledTo = [];
    await press(input, 'ArrowUp');
    expect(scrolledTo).toEqual([root().querySelector('.ik-summary')]);
  });

  it('new results from a filter click start at the top', async () => {
    const facets = [{ field: 'brand', type: 'terms', buckets: [{ key: 'Acme', count: 2 }, { key: 'Bolt', count: 1 }] }];
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('/api/v1/search')
        ? new Response(JSON.stringify({ success: true, data: { results: hits, total: { value: 3 }, facets } }), { status: 200 })
        : new Response('{}', { status: 200 })));
    await search();
    const body = root().querySelector('.ik-search-body') as HTMLElement;
    body.scrollTop = 300; // the visitor scrolled down the results
    pointerClick(root().querySelector('.ik-chip--facet')!, 'mouse');
    await flush(100);
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

describe('isMouseClick', () => {
  const fine = () => true;
  const coarse = () => false;
  it.each([
    [{ detail: 0, pointerType: 'mouse' }, fine, false], // keyboard press
    [{ detail: 1, pointerType: 'mouse' }, coarse, true],
    [{ detail: 1, pointerType: 'touch' }, fine, false],
    [{ detail: 1, pointerType: 'pen' }, fine, false],
    [{ detail: 1 }, fine, true], // browser doesn't say: a mouse or trackpad device
    [{ detail: 1 }, coarse, false], // browser doesn't say: a touch device
  ])('%o → %s', (e, pointer, expected) => {
    expect(isMouseClick(e, pointer)).toBe(expected);
  });
});

describe('search widget: inline clear button', () => {
  const hits = [1, 2, 3].map((n) => ({ id: `d${n}`, score: 1, source: { title: `Doc ${n}` } }));
  const clearButton = () => root().querySelector('button[aria-label="Clear search"]') as HTMLButtonElement | null;

  beforeEach(() => {
    document.body.innerHTML = '<div id="ik"></div>';
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('/api/v1/search')
        ? new Response(JSON.stringify({ success: true, data: { results: hits, total: { value: 3 } } }), { status: 200 })
        : new Response('{}', { status: 200 })));
  });
  afterEach(() => {
    SearchDropinUI.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows only with text, and empties the field and the results', async () => {
    await mountIn('inline', { aiSummary: false });
    expect(clearButton()).toBeNull();
    const input = root().querySelector('input') as HTMLInputElement;
    input.value = 'doc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(400);
    expect(root().querySelectorAll('.ik-result')).toHaveLength(3);

    clearButton()!.click();
    await flush(50);
    expect(input.value).toBe('');
    expect(root().querySelectorAll('.ik-result')).toHaveLength(0);
    expect(clearButton()).toBeNull();
    expect(root().activeElement).toBe(input);
  });

  it('clearing while a search is on its way: that search does not fill the results back in', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (!url.endsWith('/api/v1/search')) return new Response('{}', { status: 200 });
      await flush(200);
      const facets = [{ field: 'brand', type: 'terms', buckets: [{ key: 'Acme', count: 2 }, { key: 'Bolt', count: 1 }] }];
      return new Response(JSON.stringify({ success: true, data: { results: hits, total: { value: 3 }, facets } }), { status: 200 });
    }));
    await mountIn('inline', { aiSummary: false });
    const input = root().querySelector('input') as HTMLInputElement;
    input.value = 'doc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(350); // the search is on its way
    clearButton()!.click();
    await flush(400); // its answer has arrived

    // What the visitor would see from the old answer: the count and the filter chips
    expect(input.value).toBe('');
    expect(root().querySelector('.ik-search-footer')).toBeNull();
    expect(root().querySelectorAll('.ik-chip--facet')).toHaveLength(0);
  });

  it('clearing while a search is on its way: "Searching…" goes, and that search failing shows no error', async () => {
    let fail: (() => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (!url.endsWith('/api/v1/search')) return new Response('{}', { status: 200 });
      await new Promise<void>((resolve) => { fail = resolve; });
      throw new TypeError('network down');
    }));
    await mountIn('inline', { aiSummary: false });
    const input = root().querySelector('input') as HTMLInputElement;
    input.value = 'doc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(350);
    expect(root().textContent).toContain('Searching');

    clearButton()!.click();
    await flush(50);
    expect(root().textContent).not.toContain('Searching');

    fail!();
    await flush(50);
    expect(root().querySelector('.ik-status--error')).toBeNull();
    expect(root().textContent).not.toContain('Searching');
  });

  it('a newer search keeps "Searching…" and ignores an older one failing', async () => {
    const pending = new Map<string, () => void>();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (!url.endsWith('/api/v1/search')) return new Response('{}', { status: 200 });
      const q = JSON.parse(String(init?.body)).query as string;
      await new Promise<void>((resolve) => pending.set(q, resolve));
      if (q === 'do') throw new TypeError('network down');
      return new Response(JSON.stringify({ success: true, data: { results: hits, total: { value: 3 } } }), { status: 200 });
    }));
    await mountIn('inline', { aiSummary: false });
    const input = root().querySelector('input') as HTMLInputElement;
    input.value = 'do';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(350); // "do" on its way
    input.value = 'doc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(350); // "doc" on its way too

    pending.get('do')!(); // the older search fails
    await flush(50);
    expect(root().querySelector('.ik-status--error')).toBeNull();
    expect(root().textContent).toContain('Searching');

    pending.get('doc')!();
    await flush(50);
    expect(root().textContent).not.toContain('Searching');
    expect(root().querySelectorAll('.ik-result')).toHaveLength(3);
  });

  it('clearing also turns off an active filter chip', async () => {
    const facets = [{ field: 'brand', type: 'terms', buckets: [{ key: 'Acme', count: 2 }, { key: 'Bolt', count: 1 }] }];
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('/api/v1/search')
        ? new Response(JSON.stringify({ success: true, data: { results: hits, total: { value: 3 }, facets } }), { status: 200 })
        : new Response('{}', { status: 200 })));
    await mountIn('inline', { aiSummary: false });
    const input = root().querySelector('input') as HTMLInputElement;
    input.value = 'doc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(400);
    pointerClick(root().querySelector('.ik-chip--facet')!, 'mouse');
    await flush(50);
    expect(root().querySelector('.ik-chip--active')).not.toBeNull();

    clearButton()!.click();
    await flush(50);
    input.value = 'doc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(400);
    expect(root().querySelector('.ik-chip--active')).toBeNull();
    const lastSearch = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls
      .filter(([url]) => url.endsWith('/api/v1/search')).at(-1)!;
    expect(JSON.parse(String(lastSearch[1].body)).filters).toBeUndefined();
  });

  it('is not shown in a modal, which has Esc and the close button', async () => {
    await mountIn('modal', { aiSummary: false });
    const input = root().querySelector('input') as HTMLInputElement;
    input.value = 'doc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush(400);
    expect(clearButton()).toBeNull();
  });
});
