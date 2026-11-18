// src/hooks/use-ai-summary.cancel.test.tsx

/**
 * Leaving a search page mid-summary cancels the summarize request through the
 * real API client: the request's signal is aborted, and the cancel is not
 * reported as an error.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SearchResult } from '@/lib/api/types';

import { useAISummary } from './use-ai-summary';

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({ settings: { apiUrl: 'http://api', accessToken: 'token' }, isConfigured: true }),
}));

const results: SearchResult[] = [1, 2, 3].map((n) => ({ id: `p${n}`, score: 1, source: { name: `Product ${n}` } }));
const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

/** The summarize call writes one chunk, then stays open until its signal is aborted */
function stubSummarize() {
  const calls: Array<{ signal: AbortSignal }> = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const signal = init.signal as AbortSignal;
    calls.push({ signal });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'content', text: 'Product 2 is' })}\n`));
        signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
      },
    });
    return new Response(body, { status: 200 });
  }));
  return calls;
}

const errors: Array<Error | null> = [];
function SearchPage() {
  const summary = useAISummary();
  errors.push(summary.error);
  return (
    <>
      <button onClick={() => summary.generate('jackets', results)}>summarize</button>
      <p>{summary.summary}</p>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  errors.length = 0;
});

describe('AI summary request through the real client', () => {
  it('is cancelled when the visitor leaves the page, without an error', async () => {
    const calls = stubSummarize();
    const { unmount } = render(<SearchPage />);
    await act(async () => {
      screen.getByText('summarize').click();
      await flush();
    });
    expect(screen.getByText('Product 2 is')).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(calls[0].signal.aborted).toBe(false);

    const consoleError = vi.spyOn(console, 'error');
    unmount();
    await flush();

    expect(calls[0].signal.aborted).toBe(true);
    expect(errors.every((e) => e === null)).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
