// src/features/dashboard/home.service.analytics-off.test.ts

/**
 * The home page with Analytics off runs none of the analytics queries (not just hides their
 * results); with it on they run. The setup reads (main database) are stubbed to empty.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// A query chain that ends in no rows, whatever is called on it
const empty = (): unknown => new Proxy(() => undefined, { get: (_t, key) => (key === 'then' ? (resolve: (v: unknown[]) => void) => resolve([]) : empty()), apply: () => empty() });
vi.mock('@/db/index', () => ({
  db: empty(),
  analyticsDB: null,
}));

const analytics = vi.hoisted(() => ({
  getOverviewMetrics: vi.fn(),
  getSearchTrends: vi.fn(),
  getSearchTypeBreakdown: vi.fn(),
  getZeroResultQueries: vi.fn(),
  getTurnsByDay: vi.fn(),
  countRecentRequests: vi.fn(),
  getExperienceSummaries: vi.fn(),
  getProactiveInsights: vi.fn(),
  getStoredInsight: vi.fn(),
  listDismissedTips: vi.fn(),
}));
vi.mock('@/features/analytics/analytics-query.service', () => ({
  getOverviewMetrics: analytics.getOverviewMetrics,
  getSearchTrends: analytics.getSearchTrends,
  getSearchTypeBreakdown: analytics.getSearchTypeBreakdown,
  getZeroResultQueries: analytics.getZeroResultQueries,
}));
vi.mock('@/features/analytics/analytics-failed-turns.service', () => ({ getTurnsByDay: analytics.getTurnsByDay, countRecentRequests: analytics.countRecentRequests }));
vi.mock('@/features/analytics/analytics-experience-summary.service', () => ({ getExperienceSummaries: analytics.getExperienceSummaries }));
vi.mock('@/features/analytics/analytics-insights.service', () => ({
  getProactiveInsights: analytics.getProactiveInsights,
  getStoredInsight: analytics.getStoredInsight,
  listDismissedTips: analytics.listDismissedTips,
}));

import { getHomeData, invalidateHomeCache } from './home.service';

beforeEach(() => {
  invalidateHomeCache();
  analytics.getOverviewMetrics.mockReset().mockResolvedValue({ totalSearches: 0, zeroResultRate: 0 });
  analytics.getSearchTrends.mockReset().mockResolvedValue([]);
  analytics.getSearchTypeBreakdown.mockReset().mockResolvedValue({ lexical: 0, semantic: 0, hybrid: 0 });
  analytics.getZeroResultQueries.mockReset().mockResolvedValue([]);
  analytics.getTurnsByDay.mockReset().mockResolvedValue([]);
  analytics.countRecentRequests.mockReset().mockResolvedValue(0);
  analytics.getExperienceSummaries.mockReset().mockResolvedValue([]);
  analytics.getProactiveInsights.mockReset().mockResolvedValue({ status: 'ready', insights: [] });
  analytics.getStoredInsight.mockReset().mockResolvedValue({ data: null });
  analytics.listDismissedTips.mockReset().mockResolvedValue(new Set());
});

const queries = () => [
  analytics.getOverviewMetrics, analytics.getSearchTrends, analytics.getSearchTypeBreakdown, analytics.getZeroResultQueries,
  analytics.getTurnsByDay, analytics.countRecentRequests, analytics.getExperienceSummaries, analytics.getProactiveInsights,
];

// Each test builds the whole page; the first one also loads the database schema, slow on a busy CI runner
describe('home page data and the Analytics switch', { timeout: 30_000 }, () => {
  it('runs none of the analytics queries while Analytics is off', async () => {
    await getHomeData('UTC', false);

    for (const query of queries()) expect(query).not.toHaveBeenCalled();
  });

  it('runs them while it is on', async () => {
    await getHomeData('UTC', true);

    for (const query of queries()) expect(query).toHaveBeenCalled();
  });

  it('keeps the two pages apart: a page built with Analytics off is not served once it is on', async () => {
    await getHomeData('UTC', false);
    await getHomeData('UTC', true);

    expect(analytics.getOverviewMetrics).toHaveBeenCalled();
  });
});
