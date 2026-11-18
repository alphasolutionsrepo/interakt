/**
 * Closing the modal search stops an AI summary that is still being written, so the
 * server stops generating it (#70). A finished summary stays; a stopped one is written
 * again when the visitor reopens the search on the same query.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchDropinUI } from '../src/search/SearchWidget';

const flush = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const encoder = new TextEncoder();
const sse = (text: string) => encoder.encode(`data: ${JSON.stringify({ type: 'content', text })}\n\n`);

const hits = [1, 2, 3].map((n) => ({ id: `d${n}`, score: 1, source: { title: `Doc ${n}` } }));
const searchAnswer = () =>
  new Response(JSON.stringify({ success: true, data: { results: hits, total: { value: 3 } } }), { status: 200 });

interface SummaryCall { signal: AbortSignal | undefined }

/**
 * Search answers three hits (after `searchDelayMs`); each summary call writes "Partial "
 * and then stays open until aborted, or ends at once when `finish` is set.
 */
function stubServer({ finish = false, searchDelayMs = 0 } = {}) {
  const summaryCalls: SummaryCall[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/v1/search')) {
      if (searchDelayMs) await flush(searchDelayMs);
      return searchAnswer();
    }
    if (url.endsWith('/api/v1/autocomplete')) return new Response('{}', { status: 200 });
    if (url.endsWith('/api/v1/summarize')) {
      const signal = init?.signal ?? undefined;
      summaryCalls.push({ signal });
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(sse('Partial '));
          if (finish) controller.close();
          signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
        },
      });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    throw new Error(`unexpected ${url}`);
  }));
  return summaryCalls;
}

const root = () => document.querySelector('[data-interakt-widget]')?.shadowRoot as ShadowRoot;
const openModal = async () => {
  (root().querySelector('button[aria-label="Open search"]') as HTMLButtonElement).click();
  await flush();
};
const type = (q: string) => {
  const input = root().querySelector('input') as HTMLInputElement;
  input.value = q;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const pressEsc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

const pressCtrlK = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));

const mountModal = async (extra: Record<string, unknown> = {}) => {
  SearchDropinUI.init({ containerId: 'ik', accessToken: 'token', apiBaseUrl: 'https://interakt.test', mode: 'modal', ...extra } as Parameters<typeof SearchDropinUI.init>[0]);
  await flush();
  await openModal();
};

beforeEach(() => {
  document.body.innerHTML = '<div id="ik"></div>';
});

afterEach(() => {
  SearchDropinUI.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('search widget: closing stops a summary still being written', () => {
  const closers: Array<[string, () => void]> = [
    ['Esc', pressEsc],
    ['the close button', () => (root().querySelector('button[aria-label="Close search"]') as HTMLButtonElement).click()],
    ['the backdrop', () => (root().querySelector('.ik-backdrop') as HTMLElement).click()],
    ['removing the widget', () => SearchDropinUI.destroy()],
  ];

  it.each(closers)('%s aborts the summary request', async (_name, closeIt) => {
    const calls = stubServer();
    await mountModal();
    type('shoes');
    await flush(300);
    expect(calls).toHaveLength(1);
    expect(root().textContent).toContain('Partial');
    expect(calls[0].signal?.aborted).toBe(false);

    closeIt();
    await flush();

    expect(calls[0].signal?.aborted).toBe(true);
  });

  it('reopening writes the stopped summary again, for the same query', async () => {
    const calls = stubServer();
    await mountModal();
    type('shoes');
    await flush(300);
    pressEsc();
    await flush();

    await openModal();

    expect(calls).toHaveLength(2);
    expect(calls[1].signal?.aborted).toBe(false);
    expect(root().textContent).toContain('Partial');
  });

  it('reopening with Ctrl+K writes the stopped summary again', async () => {
    const calls = stubServer();
    await mountModal();
    type('shoes');
    await flush(300);
    pressEsc();
    await flush();

    pressCtrlK();
    await flush();

    expect(calls).toHaveLength(2);
    expect(calls[0].signal?.aborted).toBe(true);
    expect(calls[1].signal?.aborted).toBe(false);
  });

  it('with summaries turned off, closing during the search and reopening requests none', async () => {
    const calls = stubServer({ searchDelayMs: 100 });
    await mountModal({ aiSummary: false });
    type('shoes');
    await flush(250);
    pressEsc();
    await flush(150);
    await openModal();
    await flush(50);

    expect(calls).toHaveLength(0);
  });

  it('a finished summary is kept on close and not requested again on reopen', async () => {
    const calls = stubServer({ finish: true });
    await mountModal();
    type('shoes');
    await flush(300);
    pressEsc();
    await flush();
    await openModal();

    expect(calls).toHaveLength(1);
    expect(calls[0].signal?.aborted).toBe(false);
    expect(root().textContent).toContain('Partial');
  });

  it('closed while the search runs: no summary until the search is reopened', async () => {
    const calls = stubServer({ searchDelayMs: 100 });
    await mountModal();
    type('shoes');
    await flush(250); // debounce fired, search still answering
    pressEsc();
    await flush(150);

    expect(calls).toHaveLength(0);

    await openModal();
    expect(calls).toHaveLength(1);
  });

  it('a new search still cancels the previous summary', async () => {
    const calls = stubServer();
    await mountModal();
    type('shoes');
    await flush(300);
    type('boots');
    await flush(300);

    expect(calls).toHaveLength(2);
    expect(calls[0].signal?.aborted).toBe(true);
    expect(calls[1].signal?.aborted).toBe(false);
  });
});
