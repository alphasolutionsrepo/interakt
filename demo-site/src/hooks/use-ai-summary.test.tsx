// src/hooks/use-ai-summary.test.tsx

/**
 * An AI summary's citations number the results it was written from. The
 * results on screen change when the visitor pages or filters, but the summary
 * isn't rewritten, so its citations must keep pointing at the results it cites.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AISummaryContent } from '@/components/ai-summary-content';
import type { SearchResult } from '@/lib/api/types';

import { useAISummary } from './use-ai-summary';

type Stream = { onContent: (text: string) => void; onComplete: () => void; request: { results: Array<{ id: string }> } };
let stream: Stream;
const streamSummary = vi.fn((request, onContent, onComplete) => {
  stream = { request, onContent, onComplete };
});
vi.mock('@/lib/api/client', () => ({ createApiClient: () => ({ streamSummary }) }));
vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({ settings: { apiUrl: 'http://api', accessToken: 'token' }, isConfigured: true }),
}));

const product = (n: number): SearchResult => ({
  id: `p${n}`,
  score: 1,
  source: { name: `Product ${n}`, url: `/products/${n}` },
});
const page1 = [1, 2, 3, 4].map(product);
const page2 = [5, 6, 7, 8].map(product);

/** A results page with its summary, as the demo search pages render it */
function SearchPage({ results, query = 'jackets' }: { results: SearchResult[]; query?: string }) {
  const summary = useAISummary();
  return (
    <>
      <button onClick={() => summary.generate(query, results)}>summarize</button>
      <AISummaryContent
        summary={summary.summary}
        isStreaming={summary.isStreaming}
        isComplete={summary.isComplete}
        sources={summary.sources}
      />
    </>
  );
}

function summarize(text: string) {
  act(() => screen.getByText('summarize').click());
  act(() => {
    stream.onContent(text);
    stream.onComplete();
  });
}

const citation = (n: number) => screen.getAllByRole('link').find((a) => a.textContent === String(n));

beforeEach(() => {
  streamSummary.mockClear();
});
afterEach(cleanup);

describe('AI summary citations', () => {
  it('link to the result they cite', () => {
    render(<SearchPage results={page1} />);
    summarize('The best match is Product 2 [2].');

    expect(citation(2)?.getAttribute('href')).toBe('/products/2');
  });

  it('keep linking to the cited result after the visitor goes to page 2', () => {
    const { rerender } = render(<SearchPage results={page1} />);
    summarize('The best match is Product 2 [2].');

    rerender(<SearchPage results={page2} />);

    expect(citation(2)?.getAttribute('href')).toBe('/products/2');
    expect(screen.getByText('Product 2')).toBeTruthy(); // the Sources row
  });

  it('number the results sent for summarizing, at most 10', () => {
    const many = Array.from({ length: 12 }, (_, i) => product(i + 1));
    render(<SearchPage results={many} />);
    summarize('Product 10 [10] and Product 11 [11].');

    expect(stream.request.results.map((r) => r.id)).toEqual(many.slice(0, 10).map((r) => r.id));
    expect(citation(10)?.getAttribute('href')).toBe('/products/10');
    expect(citation(11)).toBeUndefined(); // not sent, so not a citation
  });

  it('follow a new summary', () => {
    const { rerender } = render(<SearchPage results={page1} />);
    summarize('Product 2 [2].');

    rerender(<SearchPage results={page2} query="boots" />);
    summarize('Product 6 [2].');

    expect(citation(2)?.getAttribute('href')).toBe('/products/6');
  });
});
