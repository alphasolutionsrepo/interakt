/**
 * A summary that stops partway (the server sends an `error` event: the model failed or went
 * quiet) is taken away instead of being left on screen as if it were the whole summary. The
 * results stay, and the visitor can ask for the summary again.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchDropinUI } from '../src/search/SearchWidget';
import { ApiError, streamSummarize } from '../src/shared/api-client';

// The search runs 300 ms after typing; the summary about 1 s after the last keystroke
const SUMMARY_STARTS = 1150;
const flush = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const encoder = new TextEncoder();
const event = (body: Record<string, unknown>) => encoder.encode(`data: ${JSON.stringify(body)}\n\n`);
const stalled = { type: 'error', error: 'The AI service took too long to answer.', code: 'INTERNAL_ERROR', requestId: 'r1' };

const hits = [1, 2, 3].map((n) => ({ id: `d${n}`, score: 1, source: { title: `Doc ${n}` } }));

/** Each summary writes "Here are some", then ends with `ending` (an error event, or nothing) */
function stubServer(ending?: Record<string, unknown>) {
  let summaries = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/api/v1/search')) {
      return new Response(JSON.stringify({ success: true, data: { results: hits, total: { value: 3 } } }), { status: 200 });
    }
    if (url.endsWith('/api/v1/autocomplete')) return new Response('{}', { status: 200 });
    if (url.endsWith('/api/v1/summarize')) {
      summaries++;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(event({ type: 'content', text: 'Here are some' }));
          if (ending) controller.enqueue(event(ending));
          else controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    throw new Error(`unexpected ${url}`);
  }));
  return () => summaries;
}

const root = () => document.querySelector('[data-interakt-widget]')?.shadowRoot as ShadowRoot;
const type = (q: string) => {
  const input = root().querySelector('input') as HTMLInputElement;
  input.value = q;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const mount = async (extra: Record<string, unknown> = {}) => {
  SearchDropinUI.init({ containerId: 'ik', accessToken: 'token', apiBaseUrl: 'https://interakt.test', mode: 'inline', ...extra } as Parameters<typeof SearchDropinUI.init>[0]);
  await flush();
};

beforeEach(() => {
  document.body.innerHTML = '<div id="ik"></div>';
});

afterEach(() => {
  SearchDropinUI.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('search widget: a summary that stops partway', () => {
  it('takes the partial summary away and keeps the results', async () => {
    stubServer(stalled);
    await mount();
    type('shirts');
    await flush(SUMMARY_STARTS);

    expect(root().querySelector('.ik-summary')).toBeNull();
    expect(root().textContent).not.toContain('Here are some');
    expect(root().textContent).toContain('Doc 1');
  });

  it('a finished summary stays', async () => {
    stubServer();
    await mount();
    type('shirts');
    await flush(SUMMARY_STARTS);

    expect(root().querySelector('.ik-summary')?.textContent).toContain('Here are some');
  });

  it('with the summary button, the visitor can ask again', async () => {
    const summaries = stubServer(stalled);
    await mount({ summaryTrigger: 'button' });
    type('shirts');
    await flush(SUMMARY_STARTS);
    const ask = () => root().querySelector('.ik-summary-ask') as HTMLButtonElement | null;

    ask()!.click();
    await flush();
    expect(summaries()).toBe(1);
    expect(root().querySelector('.ik-summary')).toBeNull();

    ask()!.click();
    await flush();
    expect(summaries()).toBe(2);
  });
});

describe('streamSummarize', () => {
  it("throws the server's error event after the text before it", async () => {
    stubServer(stalled);
    const tokens: string[] = [];
    const reading = (async () => {
      for await (const t of streamSummarize('https://interakt.test', 'token', { query: 'q', results: [], totalResults: 0 })) tokens.push(t);
    })();

    await expect(reading).rejects.toEqual(new ApiError(stalled.error, 500, 'INTERNAL_ERROR'));
    expect(tokens).toEqual(['Here are some']);
  });
});
