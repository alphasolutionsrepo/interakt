/**
 * When the experience's area is switched off, the search call answers 404 with the FEATURE_OFF
 * code and the search widget removes itself from the host page. Any other failure keeps the
 * widget, showing its error state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchDropinUI } from '../src/search/SearchWidget';

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });
const flush = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

const mountAndSearch = async (answer: Response) => {
  // Autocomplete errors are swallowed by the widget; only the search call matters here
  vi.stubGlobal('fetch', vi.fn(async () => answer.clone()));
  SearchDropinUI.init({ containerId: 'ik', accessToken: 'token', apiBaseUrl: 'https://interakt.test', mode: 'inline' } as Parameters<typeof SearchDropinUI.init>[0]);
  const host = document.querySelector('[data-interakt-widget]');
  const input = host?.shadowRoot?.querySelector('input') as HTMLInputElement;
  expect(input).not.toBeNull();
  input.value = 'shoes';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await flush(300); // debounce (200ms) + response
};

beforeEach(() => {
  document.body.innerHTML = '<div id="ik"></div>';
});

afterEach(() => {
  SearchDropinUI.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('search widget when its area is switched off', () => {
  it('removes itself from the host page on FEATURE_OFF', async () => {
    await mountAndSearch(json({ success: false, code: 'FEATURE_OFF', error: 'This feature is turned off for this installation.' }, 404));
    expect(document.querySelector('[data-interakt-widget]')).toBeNull();
    expect(document.getElementById('ik')?.children.length).toBe(0);
  });

  it('stays on a 404 without the code, showing its error state', async () => {
    await mountAndSearch(json({ success: false, error: 'Not found' }, 404));
    const host = document.querySelector('[data-interakt-widget]');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot?.textContent).toContain('Search failed');
  });

  it('stays on a 500, showing its error state', async () => {
    await mountAndSearch(new Response('boom', { status: 500 }));
    const host = document.querySelector('[data-interakt-widget]');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot?.textContent).toContain('Search failed');
  });

  it('a late FEATURE_OFF for a replaced instance leaves the new widget in place', async () => {
    let releaseOld!: () => void;
    const oldAnswer = new Promise<Response>((resolve) => {
      releaseOld = () => resolve(json({ success: false, code: 'FEATURE_OFF', error: 'off' }, 404));
    });
    const initAndType = (answer: Promise<Response> | Response) => {
      vi.stubGlobal('fetch', vi.fn(async () => (answer instanceof Promise ? answer : answer.clone())));
      SearchDropinUI.init({ containerId: 'ik', accessToken: 'token', apiBaseUrl: 'https://interakt.test', mode: 'inline' } as Parameters<typeof SearchDropinUI.init>[0]);
      const input = document.querySelector('[data-interakt-widget]')?.shadowRoot?.querySelector('input') as HTMLInputElement;
      input.value = 'shoes';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    initAndType(oldAnswer); // its search call stays pending
    await flush(300);
    initAndType(json({ success: false, error: 'Not found' }, 404)); // replacement: a plain failure, stays on
    await flush(300);
    releaseOld();
    await flush(50);
    const host = document.querySelector('[data-interakt-widget]');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot?.querySelector('input')).not.toBeNull();
  });
});
