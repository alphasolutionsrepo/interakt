// src/app/playground/search/_lib/read-suggestions.test.ts

/**
 * The playground's two autocomplete inputs read their answer here: a failure keeps the
 * hint and request id the server sent, so the input can say what to do about it.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api/api-error';

import { askForSuggestions, readSuggestions } from './read-suggestions';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('readSuggestions', () => {
  it('gives the suggestions of a good answer', async () => {
    expect(await readSuggestions(json({ success: true, data: { suggestions: [{ text: 'linen' }], took: 3 } }))).toEqual({ suggestions: [{ text: 'linen' }], took: 3 });
  });

  it('throws a failed answer with its code, hint and request id', async () => {
    const failed = json({ success: false, code: 'UPSTREAM_UNAVAILABLE', message: "Elasticsearch couldn't be reached.", error: "Elasticsearch couldn't be reached.", hint: 'Check that it is running.', requestId: 'r1' }, 503);
    await expect(readSuggestions(failed)).rejects.toMatchObject({ message: "Elasticsearch couldn't be reached.", code: 'UPSTREAM_UNAVAILABLE', hint: 'Check that it is running.', requestId: 'r1' });
  });

  it('throws a gateway error page as a readable error', async () => {
    const page = new Response('<html>Bad gateway</html>', { status: 502 });
    await expect(readSuggestions(page)).rejects.toEqual(new ApiError('Suggestions failed (502)', 502));
  });

  it('throws an answer without suggestions as invalid', async () => {
    await expect(readSuggestions(json({ success: true, data: {} }))).rejects.toThrow('Invalid response');
  });
});

describe('askForSuggestions', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('asks with the token and the test marker, so the admin gets a failure explained', async () => {
    const fetchStub = vi.fn(async () => json({ success: true, data: { suggestions: [] } }));
    vi.stubGlobal('fetch', fetchStub);

    await askForSuggestions('/api/v1/autocomplete', 'tok', { query: 'lin' }, new AbortController().signal);

    const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/autocomplete');
    expect(init.headers).toMatchObject({ 'X-Access-Token': 'tok', 'x-interakt-test': '1' });
    expect(JSON.parse(String(init.body))).toEqual({ query: 'lin' });
  });

  it('gives null for a request that was aborted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }));
    expect(await askForSuggestions('/api/v1/autocomplete', 'tok', { query: 'lin' }, new AbortController().signal)).toBeNull();
  });
});
