/**
 * The widget sends cookies to its own origin only, and a test marker only in test mode (the
 * admin's Widget playground). The server records a test only with both the marker and the
 * admin's login; on a visitor's site (another origin) no cookie is sent and no marker is set.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { performSearch, streamChat, streamSummarize } from '../src/shared/api-client';

const emptyStream = () =>
  new Response(new ReadableStream({ start: (c) => c.close() }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

afterEach(() => vi.unstubAllGlobals());

describe('widget requests that are recorded as traffic', () => {
  it('send credentials to the same origin only (search, summary, chat)', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith('/api/v1/search') ? new Response(JSON.stringify({ data: { results: [] } }), { status: 200 }) : emptyStream(),
    );
    vi.stubGlobal('fetch', fetchMock);

    await performSearch('https://interakt.test', 'token', { query: 'jeans' } as Parameters<typeof performSearch>[2]);
    for await (const _ of streamSummarize('https://interakt.test', 'token', { query: 'jeans', results: [], totalResults: 0 })) { /* drain */ }
    for await (const _ of streamChat({ apiBaseUrl: 'https://interakt.test', accessToken: 'token', message: 'hi' })) { /* drain */ }

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.credentials])).toEqual([
      ['https://interakt.test/api/v1/search', 'same-origin'],
      ['https://interakt.test/api/v1/summarize', 'same-origin'],
      ['https://interakt.test/api/v1/ai-experiences/chat', 'same-origin'],
    ]);
  });

  it('mark a request as a test only in test mode', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => emptyStream());
    vi.stubGlobal('fetch', fetchMock);
    const marker = () => (fetchMock.mock.calls.at(-1)?.[1]?.headers as Record<string, string>)['X-Interakt-Test'];

    for await (const _ of streamChat({ apiBaseUrl: 'https://interakt.test', accessToken: 'token', message: 'hi' })) { /* drain */ }
    expect(marker()).toBeUndefined();
    for await (const _ of streamChat({ apiBaseUrl: 'https://interakt.test', accessToken: 'token', message: 'hi', testMode: true })) { /* drain */ }
    expect(marker()).toBe('1');
    for await (const _ of streamSummarize('https://interakt.test', 'token', { query: 'jeans', results: [], totalResults: 0 }, undefined, true)) { /* drain */ }
    expect(marker()).toBe('1');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { results: [] } }), { status: 200 }));
    await performSearch('https://interakt.test', 'token', { query: 'jeans' } as Parameters<typeof performSearch>[2], true);
    expect(marker()).toBe('1');
  });
});
