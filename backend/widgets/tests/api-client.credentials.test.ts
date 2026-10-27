/**
 * The widget sends cookies to its own origin only. In the admin's Widget playground that is
 * the admin's session, which tells the server the chat, search or summary is a test; on a
 * visitor's site (another origin) no cookie is sent.
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
});
