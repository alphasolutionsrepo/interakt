// src/features/analytics/analytics-dashboard.handler.test.ts

/**
 * The overview page's single request: Popular and Failed Searches list visitor searches,
 * Assistant Searches the assistant's, and whether any of the assistant's searches failed
 * comes from all of them, not just the most frequent queries the card lists.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db/index', () => ({ analyticsDB: null, db: {} }));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));

const query = vi.hoisted(() => ({
  getPopularQueries: vi.fn(),
  getZeroResultQueries: vi.fn(),
}));
vi.mock('./index', async (importOriginal) => ({ ...(await importOriginal<object>()), ...query }));

import { handleGetDashboard } from './analytics.api.handlers';

const failed = (q: string) => ({ query: q, count: 1, lastSearched: new Date().toISOString() });

async function dashboard() {
  const response = await handleGetDashboard(new NextRequest('http://localhost/api/analytics/dashboard?timeRange=24h'));
  return ((await response.json()) as { data: Record<string, unknown> }).data;
}

beforeEach(() => {
  query.getPopularQueries.mockReset().mockResolvedValue([]);
  query.getZeroResultQueries.mockReset().mockImplementation(async (...args: unknown[]) =>
    args[4] === 'assistant' ? [failed('vegan leather tote')] : []
  );
});

describe('overview dashboard', () => {
  it('lists visitor searches in Popular and Failed Searches, and the assistant’s in Assistant Searches', async () => {
    await dashboard();

    const origins = (mock: typeof query.getPopularQueries) => mock.mock.calls.map((call) => call[4]).sort();
    expect(origins(query.getPopularQueries)).toEqual(['assistant', 'visitor']);
    expect(origins(query.getZeroResultQueries)).toEqual(['assistant', 'visitor']);
  });

  it('says the assistant had failed searches even when none is among its most frequent queries', async () => {
    const data = await dashboard();

    expect(data.zeroResults).toEqual([]);
    expect(data.assistantQueries).toEqual([]);
    expect(data.assistantHasFailedSearches).toBe(true);
  });

  it('says so only when one of the assistant’s searches failed', async () => {
    query.getZeroResultQueries.mockResolvedValue([]);

    expect((await dashboard()).assistantHasFailedSearches).toBe(false);
  });
});
