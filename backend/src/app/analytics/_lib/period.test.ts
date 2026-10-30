// app/analytics/_lib/period.test.ts

/**
 * Periods resolve to whole local days (so day bars are complete), custom dates
 * are inclusive, and the URL round-trips. Assertions use local time, so they
 * hold in whatever time zone the tests run in.
 */

import { describe, expect, it } from 'vitest';

import {
  approximateTimeRange,
  formatSpan,
  previousPeriod,
  periodFromParams,
  periodLabel,
  resolvePeriod,
  writePeriodParams,
  type Period,
} from './period';

// Thursday 23 Oct 2026, 15:30 local
const now = new Date(2026, 9, 23, 15, 30);

describe('resolvePeriod', () => {
  it('starts day presets at local midnight and ends now', () => {
    expect(resolvePeriod({ preset: 'today' }, now)).toEqual({ from: new Date(2026, 9, 23), to: now });
    expect(resolvePeriod({ preset: '7d' }, now)).toEqual({ from: new Date(2026, 9, 17), to: now });
  });

  it('covers whole days for yesterday and last month', () => {
    expect(resolvePeriod({ preset: 'yesterday' }, now)).toEqual({ from: new Date(2026, 9, 22), to: new Date(2026, 9, 23) });
    expect(resolvePeriod({ preset: 'last_month' }, now)).toEqual({ from: new Date(2026, 8, 1), to: new Date(2026, 9, 1) });
  });

  it('includes the last custom day, but never runs past now', () => {
    expect(resolvePeriod({ from: '2026-10-01', to: '2026-10-13' }, now)).toEqual({
      from: new Date(2026, 9, 1),
      to: new Date(2026, 9, 14),
    });
    expect(resolvePeriod({ from: '2026-10-20', to: '2026-10-23' }, now).to).toEqual(now);
  });
});

describe('labels and nearest range', () => {
  it('labels presets and custom dates', () => {
    expect(periodLabel({ preset: '30d' }, now)).toBe('Last 30 days');
    expect(periodLabel({ from: '2026-10-01', to: '2026-10-13' }, now)).toBe('Oct 1 – Oct 13');
    expect(periodLabel({ from: '2026-10-13', to: '2026-10-13' }, now)).toBe('Oct 13');
  });

  it('maps periods to the nearest fixed range', () => {
    expect(approximateTimeRange({ preset: 'yesterday' }, now)).toBe('24h');
    expect(approximateTimeRange({ preset: '7d' }, now)).toBe('7d');
    expect(approximateTimeRange({ preset: 'last_month' }, now)).toBe('30d');
    expect(approximateTimeRange({ preset: '90d' }, now)).toBe('90d');
  });
});

describe('URL', () => {
  it.each<Period>([{ preset: 'this_month' }, { from: '2026-10-01', to: '2026-10-13' }])('round-trips %o', (period) => {
    const url = new URL('https://example.test/analytics/overview?experience=x');
    writePeriodParams(url, period);
    expect(periodFromParams(url.searchParams)).toEqual(period);
    expect(url.searchParams.get('experience')).toBe('x');
  });

  it('ignores malformed periods and maps the retired 1h preset', () => {
    expect(periodFromParams(new URLSearchParams('from=2026-10-13&to=2026-10-01'))).toBeNull();
    expect(periodFromParams(new URLSearchParams('range=forever'))).toBeNull();
    expect(periodFromParams(new URLSearchParams('range=1h'))).toEqual({ preset: '24h' });
  });
});

describe('previousPeriod', () => {
  it('is the same calendar days just before, for whole days', () => {
    const custom = previousPeriod({ from: '2026-10-08', to: '2026-10-14' }, now);
    expect(custom).toEqual({ from: new Date(2026, 9, 1), to: new Date(2026, 9, 8) });
    expect(formatSpan(custom)).toBe('Oct 1 – Oct 7');
    expect(formatSpan(previousPeriod({ preset: 'yesterday' }, now))).toBe('Oct 21');
  });

  it('stops at the same time of day when the period runs to now', () => {
    const lastWeek = previousPeriod({ preset: '7d' }, now);
    expect(lastWeek).toEqual({ from: new Date(2026, 9, 10), to: new Date(2026, 9, 16, 15, 30) });
    expect(formatSpan(lastWeek)).toBe('Oct 10 – Oct 16, to 15:30');
    expect(formatSpan(previousPeriod({ preset: 'today' }, now))).toBe('Oct 22, to 15:30');
  });

  it('compares months with months', () => {
    expect(previousPeriod({ preset: 'this_month' }, now)).toEqual({ from: new Date(2026, 8, 1), to: new Date(2026, 8, 23, 15, 30) });
    expect(previousPeriod({ preset: 'last_month' }, now)).toEqual({ from: new Date(2026, 7, 1), to: new Date(2026, 8, 1) });
    // Mar 31 has no Feb counterpart; it stays in February
    expect(previousPeriod({ preset: 'this_month' }, new Date(2026, 2, 31, 9)).to).toEqual(new Date(2026, 1, 28, 9));
  });

  it('names a rolling 24 hours by its times', () => {
    expect(formatSpan(previousPeriod({ preset: '24h' }, now))).toBe('Oct 21, 15:30 – Oct 22, 15:30');
  });
});
