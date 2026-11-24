/**
 * When the search widget starts an AI summary. Results stay live as the visitor types;
 * the summary starts once the search has stopped changing for about a second, so a
 * summary isn't started (and then cancelled) for every keystroke or filter click.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchDropinUI } from '../src/search/SearchWidget';

const flush = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const encoder = new TextEncoder();

type Source = Record<string, unknown>;
const docs = (extra: Source = {}) => [1, 2, 3].map((n) => ({ id: `d${n}`, score: 1, source: { title: `Doc ${n}`, ...extra } }));
const facets = [{ field: 'brand', type: 'terms', buckets: [{ key: 'Acme', count: 2 }, { key: 'Bolt', count: 1 }] }];

/** A server whose searches answer three hits (after searchDelayMs) and whose summaries finish at once. */
function stubServer({ searchDelayMs = 0, source = {} as Source } = {}) {
  const searches: string[] = [];
  const summaries: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith('/api/v1/search')) {
      searches.push(body.query);
      if (searchDelayMs) await flush(searchDelayMs);
      return new Response(JSON.stringify({ success: true, data: { results: docs(source), total: { value: 3 }, facets } }), { status: 200 });
    }
    if (url.endsWith('/api/v1/autocomplete')) return new Response('{}', { status: 200 });
    if (url.endsWith('/api/v1/summarize')) {
      summaries.push(body.query);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', text: `About ${body.query}` })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    throw new Error(`unexpected ${url}`);
  }));
  return { searches, summaries };
}

const root = () => document.querySelector('[data-interakt-widget]')?.shadowRoot as ShadowRoot;
const input = () => root().querySelector('input') as HTMLInputElement;
const setValue = (q: string) => {
  input().value = q;
  input().dispatchEvent(new Event('input', { bubbles: true }));
};
/** Types q one character at a time, `gapMs` apart, like a visitor. */
const typeSlowly = async (q: string, gapMs: number) => {
  for (let i = 1; i <= q.length; i++) {
    setValue(q.slice(0, i));
    if (i < q.length) await flush(gapMs);
  }
};
const pressEnter = () => input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

const mount = async (extra: Record<string, unknown> = {}) => {
  SearchDropinUI.init({ containerId: 'ik', accessToken: 'token', apiBaseUrl: 'https://interakt.test', mode: 'inline', ...extra } as Parameters<typeof SearchDropinUI.init>[0]);
  await flush();
};

beforeEach(() => {
  document.body.innerHTML = '<div id="ik"></div>';
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  SearchDropinUI.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('search widget: summary waits for the visitor to pause', () => {
  it('typing at an average pace (250 ms a key) searches as it goes but starts one summary', async () => {
    const { searches, summaries } = stubServer();
    await mount();
    await typeSlowly('shoes', 250);
    await flush(1200);

    expect(searches.length).toBe(1); // 300 ms after a keystroke: none of the 250 ms gaps runs a search
    expect(summaries).toEqual(['shoes']);
  });

  it('pausing between words searches each word, still one summary', async () => {
    const { searches, summaries } = stubServer();
    await mount();
    setValue('red');
    await flush(450);
    setValue('red summer');
    await flush(450);
    setValue('red summer dress');
    await flush(1200);

    expect(searches).toEqual(['red', 'red summer', 'red summer dress']);
    expect(summaries).toEqual(['red summer dress']);
  });

  it('runs the search 300 ms after the last keystroke, not 200', async () => {
    const { searches } = stubServer();
    await mount();
    setValue('shoes');
    await flush(230);
    expect(searches).toHaveLength(0);
    await flush(150);
    expect(searches).toEqual(['shoes']);
  });

  it('starts the summary about 1 s after the last keystroke, not when the results land', async () => {
    const { summaries } = stubServer();
    await mount();
    setValue('shoes');
    await flush(700); // results have landed
    expect(summaries).toHaveLength(0);
    await flush(450);
    expect(summaries).toEqual(['shoes']);
  });

  it('filter clicks wait for the pause too: clicking through filters starts one summary', async () => {
    const { summaries } = stubServer();
    await mount();
    setValue('shoes');
    await flush(1200);
    expect(summaries).toEqual(['shoes']);

    const chips = () => [...root().querySelectorAll<HTMLButtonElement>('.ik-chip--facet')];
    chips()[0].click();
    await flush(200);
    chips()[1].click();
    await flush(200);
    chips()[1].click();
    await flush(300);
    expect(summaries).toHaveLength(1); // nothing yet for the filter clicks
    await flush(900);
    expect(summaries).toHaveLength(2);
  });
});

describe('search widget: Enter', () => {
  it('on a result without a link starts the summary at once', async () => {
    const { summaries } = stubServer();
    await mount();
    setValue('shoes');
    await flush(400); // results in, the pause not over
    pressEnter();
    await flush(50);
    expect(summaries).toEqual(['shoes']);

    await flush(900); // the pause passing doesn't start it again
    expect(summaries).toEqual(['shoes']);
  });

  it('on a result with a link opens it, as before', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { summaries } = stubServer({ source: { url: 'https://example.com/shoes' } });
    await mount();
    setValue('shoes');
    await flush(400);
    pressEnter();
    await flush(50);

    expect(open).toHaveBeenCalledWith('https://example.com/shoes', '_blank', 'noopener,noreferrer');
    expect(summaries).toHaveLength(0);
  });
});

describe('search widget: clearing the field', () => {
  it('a search still on its way is dropped: no results come back and no summary starts', async () => {
    const { searches, summaries } = stubServer({ searchDelayMs: 200 });
    await mount();
    setValue('c');
    await flush(350); // the search for "c" is on its way
    setValue('');
    await flush(1500);

    expect(searches).toEqual(['c']);
    expect(root().querySelectorAll('.ik-result')).toHaveLength(0);
    expect(summaries).toHaveLength(0);
    expect(root().textContent).not.toContain('About c');
  });
});

describe("search widget: summaryTrigger 'button'", () => {
  const askButton = () =>
    [...root().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('AI summary'));

  it('starts no summary on its own, and one when the button is clicked', async () => {
    const { summaries } = stubServer();
    await mount({ summaryTrigger: 'button' });
    setValue('shoes');
    await flush(1300);
    expect(summaries).toHaveLength(0);

    askButton()!.click();
    await flush(50);
    expect(summaries).toEqual(['shoes']);
    expect(root().textContent).toContain('About shoes');
    expect(askButton()).toBeUndefined();
  });

  it('shows no button when summaries are off', async () => {
    stubServer();
    await mount({ summaryTrigger: 'button', aiSummary: false });
    setValue('shoes');
    await flush(500);
    expect(askButton()).toBeUndefined();
  });
});

describe('search widget: review follow-ups', () => {
  type SummaryAnswer = 'ok' | 'fail' | 'empty';
  /** Like stubServer, with a slow search on demand and each summary answering in turn. */
  function stub({ searchDelayMs = 0, summaryAnswers = [] as SummaryAnswer[], source = {} as Source } = {}) {
    const searches: string[] = [];
    const summaries: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.endsWith('/api/v1/search')) {
        searches.push(body.query);
        if (searchDelayMs) await flush(searchDelayMs);
        return new Response(JSON.stringify({ success: true, data: { results: docs(source), total: { value: 3 }, facets } }), { status: 200 });
      }
      if (url.endsWith('/api/v1/autocomplete')) return new Response('{}', { status: 200 });
      if (url.endsWith('/api/v1/summarize')) {
        summaries.push(body.query);
        const answer = summaryAnswers[summaries.length - 1] ?? 'ok';
        if (answer === 'fail') return new Response('{}', { status: 500 });
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            if (answer === 'ok') controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', text: `About ${body.query}` })}\n\n`));
            controller.close();
          },
        });
        return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }
      throw new Error(`unexpected ${url}`);
    }));
    return { searches, summaries };
  }
  const askButton = () =>
    [...root().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('AI summary'));

  it.each(['fail', 'empty'] as const)("'button' mode: after a summary that came back %s, the button asks again", async (answer) => {
    const { summaries } = stub({ summaryAnswers: [answer, 'ok'] });
    await mount({ summaryTrigger: 'button' });
    setValue('shoes');
    await flush(500);
    askButton()!.click();
    await flush(100);
    expect(summaries).toHaveLength(1);
    expect(askButton()).toBeDefined();

    askButton()!.click();
    await flush(100);
    expect(summaries).toHaveLength(2);
    expect(root().textContent).toContain('About shoes');
  });

  it("'pause' mode: after a failed summary, Enter asks again", async () => {
    const { summaries } = stub({ summaryAnswers: ['fail', 'ok'] });
    await mount();
    setValue('shoes');
    await flush(1300);
    expect(summaries).toHaveLength(1);
    pressEnter();
    await flush(100);
    expect(summaries).toHaveLength(2);
  });

  it("'button' mode: Enter on a result without a link starts no summary, and still reports the choice", async () => {
    const onEvent = vi.fn();
    const { summaries } = stub();
    await mount({ summaryTrigger: 'button', onEvent });
    setValue('shoes');
    await flush(500);
    pressEnter();
    await flush(100);
    expect(summaries).toHaveLength(0);
    expect(onEvent).toHaveBeenCalledWith({ type: 'search:result_clicked', payload: { id: 'd1', url: undefined } });
  });

  it("'pause' mode: Enter on a result without a link reports the choice as before, and starts the summary", async () => {
    const onEvent = vi.fn();
    const { summaries } = stub();
    await mount({ onEvent });
    setValue('shoes');
    await flush(500);
    pressEnter();
    await flush(100);
    expect(onEvent).toHaveBeenCalledWith({ type: 'search:result_clicked', payload: { id: 'd1', url: undefined } });
    expect(summaries).toEqual(['shoes']);
  });

  it('Enter while a newer search is loading does not summarise the old results', async () => {
    const { summaries } = stub({ searchDelayMs: 300 });
    await mount();
    setValue('shoes');
    await flush(700); // results for "shoes" are in
    setValue('boots');
    await flush(400); // the "boots" search is on its way
    pressEnter();
    await flush(50);
    expect(summaries).toHaveLength(0);
  });

  it("'button' mode: the button hides while the field shows text that hasn't been searched yet", async () => {
    stub();
    await mount({ summaryTrigger: 'button' });
    setValue('shoes');
    await flush(500);
    expect(askButton()).toBeDefined();
    setValue('shoes and boots');
    await flush(50);
    expect(askButton()).toBeUndefined();
  });

  it('emptying the field clears the results at once', async () => {
    stub();
    await mount();
    setValue('shoes');
    await flush(500);
    expect(root().querySelectorAll('.ik-result')).toHaveLength(3);
    setValue('');
    await flush(30);
    expect(root().querySelectorAll('.ik-result')).toHaveLength(0);
    expect(root().querySelector('.ik-search-footer')).toBeNull();
  });

  it('modal closed while waiting for the pause: no summary until it is reopened, then it is written', async () => {
    const { summaries } = stub();
    SearchDropinUI.init({ containerId: 'ik', accessToken: 'token', apiBaseUrl: 'https://interakt.test', mode: 'modal' });
    await flush();
    (root().querySelector('button[aria-label="Open search"]') as HTMLButtonElement).click();
    await flush();
    setValue('shoes');
    await flush(500); // results in, waiting for the pause
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush(1000); // the pause passes while closed
    expect(summaries).toHaveLength(0);

    (root().querySelector('button[aria-label="Open search"]') as HTMLButtonElement).click();
    await flush(100);
    expect(summaries).toEqual(['shoes']);
  });
});
