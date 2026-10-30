// src/app/analytics/search/page.assistant-searches.test.ts

/**
 * The Search section keeps what visitors typed apart from what the assistant searched for: the
 * Assistant searches card lists the assistant's queries, and Failed searches doesn't say every
 * search found results when only the assistant's searches found nothing.
 */

import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { dashboard } = vi.hoisted(() => ({ dashboard: { data: undefined as unknown } }));
vi.mock('../_lib/AnalyticsContext', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAnalyticsContext: () => ({
    experienceId: undefined,
    experienceType: undefined,
    experienceName: undefined,
    timeRange: '24h',
    period: { preset: '24h' },
    periodLabel: 'Last 24 hours',
  }),
}));
vi.mock('../_lib/AskPanelContext', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAskPanel: () => ({ open: vi.fn() }),
}));
vi.mock('../_lib/hooks/useAnalytics', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAnalyticsDashboard: () => ({ data: dashboard.data, isLoading: false, isFetching: false }),
  usePreviousAnalyticsDashboard: () => ({ data: undefined }),
}));

import AnalyticsSearchPage from './page';

function render(data: Record<string, unknown>) {
  dashboard.data = {
    overview: { totalSearches: 4, zeroResultRate: 0.25, avgSearchDurationMs: 20 },
    popularQueries: [],
    zeroResults: [],
    assistantQueries: [],
    assistantHasFailedSearches: false,
    ...data,
  };
  return renderToStaticMarkup(createElement(AnalyticsSearchPage));
}

describe('search section: visitor and assistant searches', () => {
  it("lists the assistant's queries, with how often each found nothing", () => {
    const html = render({ assistantQueries: [{ query: 'linen shirts', searchCount: 3, zeroResultCount: 1, avgResults: 2, ranCount: 3 }] });

    expect(html).toContain('Assistant searches');
    expect(html).toContain('linen shirts');
    expect(html).toContain('33% no results');
    expect(html).toContain('No visitor searches yet. The assistant&#x27;s searches are under Assistant searches.');
  });

  it("says the assistant's searches failed instead of saying every search found results", () => {
    const html = render({ assistantHasFailedSearches: true });

    expect(html).toContain('No failed visitor searches.');
    expect(html).not.toContain('Every search found results');
  });

  it("notes internal lookups apart from the searches they aren't counted in", () => {
    const html = render({
      overview: { totalSearches: 4, zeroResultRate: 0, avgSearchDurationMs: 20, searchesByTrigger: { user: 3, ai_tool: 1, lookups: 28 } },
    });

    expect(html).toContain('Plus 28 lookups by Find Record, List Values and query understanding, not');
  });

  it('says every search found results when none failed', () => {
    expect(render({ overview: { totalSearches: 4, zeroResultRate: 0, avgSearchDurationMs: 20 } })).toContain('Every search found results');
  });
});
