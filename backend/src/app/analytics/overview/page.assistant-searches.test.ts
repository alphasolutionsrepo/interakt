// src/app/analytics/overview/page.assistant-searches.test.ts

/**
 * The overview keeps what visitors typed apart from what the assistant searched for: the
 * Assistant Searches card lists the assistant's queries, and Failed Searches doesn't call
 * everything successful when only the assistant's searches found nothing.
 */

import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { dashboard } = vi.hoisted(() => ({ dashboard: { data: undefined as unknown } }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, refetch: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('../_lib/AnalyticsContext', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAnalyticsContext: () => ({ experienceId: undefined, experienceType: undefined, experienceName: undefined, timeRange: '24h' }),
}));
vi.mock('../_lib/hooks/useAnalytics', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAnalyticsDashboard: () => ({ data: dashboard.data, isLoading: false, isFetching: false }),
}));

import AnalyticsOverviewPage from './page';

function render(data: Record<string, unknown>) {
  dashboard.data = {
    overview: { totalSearches: 4, zeroResultRate: 0.25, avgSearchDurationMs: 20 },
    popularQueries: [],
    zeroResults: [],
    assistantQueries: [],
    assistantHasFailedSearches: false,
    ...data,
  };
  return renderToStaticMarkup(createElement(AnalyticsOverviewPage));
}

describe('overview: visitor and assistant searches', () => {
  it("lists the assistant's queries, with how often each found nothing", () => {
    const html = render({ assistantQueries: [{ query: 'linen shirts', searchCount: 3, zeroResultCount: 1, avgResults: 2 }] });

    expect(html).toContain('Assistant Searches');
    expect(html).toContain('linen shirts');
    expect(html).toContain('1 with no results');
    expect(html).toContain("No visitor searches yet. The assistant&#x27;s searches are under Assistant Searches.");
  });

  it("says the assistant's searches failed instead of calling all searches successful", () => {
    const html = render({ assistantHasFailedSearches: true });

    expect(html).toContain('No failed visitor searches.');
    expect(html).not.toContain('All searches successful');
  });

  it('calls all searches successful when none failed', () => {
    expect(render({ overview: { totalSearches: 4, zeroResultRate: 0, avgSearchDurationMs: 20 } })).toContain('All searches successful');
  });
});
