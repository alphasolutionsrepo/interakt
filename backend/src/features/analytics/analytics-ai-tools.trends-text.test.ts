// src/features/analytics/analytics-ai-tools.trends-text.test.ts

/**
 * The trends text the analytics chat reads: buckets are dated in the viewer's
 * time zone (a day starting 22:00 UTC is the next day in Copenhagen), the
 * busiest bucket is named, and long series keep the busiest and the most
 * recent buckets rather than the oldest.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/index', () => ({ analyticsDB: null }));

import { formatTrendsForAI } from './analytics-ai-tools';

const point = (iso: string, totalSearches: number) => ({
  timestamp: new Date(iso),
  totalSearches,
  uniqueQueries: totalSearches,
  zeroResults: 0,
  avgDurationMs: 100,
});

describe('formatTrendsForAI', () => {
  it('dates day buckets in the viewer’s time zone and names the busiest day', () => {
    // Copenhagen midnights, as the server groups them (UTC+2 in October)
    const text = formatTrendsForAI(
      [point('2026-10-11T22:00:00Z', 12), point('2026-10-12T22:00:00Z', 410), point('2026-10-13T22:00:00Z', 9)],
      'Europe/Copenhagen',
    );

    expect(text).toContain('Busiest day: Tue, Oct 13, 2026 (410 searches)');
    expect(text).toContain('- Mon, Oct 12, 2026: 12 searches');
    expect(text).toContain('times in Europe/Copenhagen');
  });

  it('keeps hours as hours when only a few of them had searches', () => {
    // Searches at 10:00 on two days, 24 hours apart: still an hourly series
    const text = formatTrendsForAI([point('2026-10-12T10:00:00Z', 5), point('2026-10-13T10:00:00Z', 7)], 'UTC', 'hour');

    expect(text).toContain('2 hours with searches; hours not listed had none');
    expect(text).toContain('- Oct 13, 2026, 10:00: 7 searches');
  });

  it('lists the busiest and most recent buckets of a long series, not the oldest', () => {
    const hours = Array.from({ length: 48 }, (_, i) =>
      point(new Date(Date.UTC(2026, 9, 20, i)).toISOString(), i === 3 ? 500 : i + 1),
    );
    const text = formatTrendsForAI(hours, 'UTC', 'hour');

    expect(text).toContain('Busiest hour: Oct 20, 2026, 03:00 (500 searches)');
    expect(text).toContain('Most recent hours');
    expect(text).toContain('Oct 21, 2026, 23:00: 48 searches');
    expect(text).not.toContain('Oct 20, 2026, 00:00: 1 searches');
  });
});
