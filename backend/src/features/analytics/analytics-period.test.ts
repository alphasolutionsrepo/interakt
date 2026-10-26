// src/features/analytics/analytics-period.test.ts

/**
 * Reading an explicit period and time zone off an analytics request: valid
 * ones pass through, malformed ones are refused (the handlers answer 400).
 */

import { describe, expect, it } from 'vitest';

import {
  PeriodError,
  calendarDaysIn,
  describePeriod,
  isValidTimeZone,
  previousPeriodIn,
  readRequestedPeriod,
  readTimeZone,
  startOfDayIn,
} from './analytics-period';

const params = (q: Record<string, string>) => new URLSearchParams(q);

describe('readRequestedPeriod', () => {
  it('returns nothing when the request names no period', () => {
    expect(readRequestedPeriod(params({ timeRange: '7d' }))).toBeUndefined();
  });

  it('reads from and to', () => {
    const period = readRequestedPeriod(params({ from: '2026-10-12T22:00:00.000Z', to: '2026-10-13T22:00:00.000Z' }));
    expect(period).toEqual({ from: new Date('2026-10-12T22:00:00.000Z'), to: new Date('2026-10-13T22:00:00.000Z') });
  });

  it.each([
    [{ from: '2026-10-12T00:00:00Z' }, 'needs both'],
    [{ from: 'yesterday', to: '2026-10-13T00:00:00Z' }, 'ISO'],
    [{ from: '2026-10-13T00:00:00Z', to: '2026-10-12T00:00:00Z' }, 'before'],
    [{ from: '2024-01-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }, '400 days'],
  ])('refuses %o', (query, message) => {
    expect(() => readRequestedPeriod(params(query))).toThrow(PeriodError);
    expect(() => readRequestedPeriod(params(query))).toThrow(message);
  });
});

describe('time zones', () => {
  it('accepts IANA zones and defaults to UTC', () => {
    expect(readTimeZone(params({ tz: 'Europe/Copenhagen' }))).toBe('Europe/Copenhagen');
    expect(readTimeZone(params({}))).toBe('UTC');
  });

  it('refuses unknown or unsafe zones', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone("UTC'; DROP TABLE x;--")).toBe(false);
    expect(() => readTimeZone(params({ tz: 'Nowhere/Land' }))).toThrow(PeriodError);
  });
});

describe('calendar days in a time zone', () => {
  it('starts a day at local midnight, across summer time', () => {
    // Copenhagen is UTC+2 in summer, UTC+1 in winter (change on 25 Oct 2026)
    expect(startOfDayIn('2026-10-13', 'Europe/Copenhagen').toISOString()).toBe('2026-10-12T22:00:00.000Z');
    expect(startOfDayIn('2026-11-02', 'Europe/Copenhagen').toISOString()).toBe('2026-11-01T23:00:00.000Z');
    expect(startOfDayIn('2026-10-13', 'UTC').toISOString()).toBe('2026-10-13T00:00:00.000Z');
  });

  it('covers whole days, inclusive, but not past now', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    expect(calendarDaysIn('2026-10-13', '2026-10-13', 'Europe/Copenhagen', now)).toEqual({
      from: new Date('2026-10-12T22:00:00.000Z'),
      to: new Date('2026-10-13T22:00:00.000Z'),
    });
    expect(calendarDaysIn('2026-10-19', '2026-10-25', 'Europe/Copenhagen', now).to).toEqual(now);
    expect(() => calendarDaysIn('2026-10-14', '2026-10-13', 'UTC', now)).toThrow(PeriodError);
  });

  it('describes periods in words', () => {
    const tz = 'Europe/Copenhagen';
    expect(describePeriod(calendarDaysIn('2026-10-13', '2026-10-13', tz, new Date('2027-01-01')), tz)).toBe('Oct 13, 2026');
    expect(describePeriod(calendarDaysIn('2026-10-01', '2026-10-13', tz, new Date('2027-01-01')), tz)).toBe('Oct 1, 2026 – Oct 13, 2026');
    expect(describePeriod({ from: new Date('2026-10-13T08:30:00Z'), to: new Date('2026-10-13T10:00:00Z') }, tz)).toBe(
      'Oct 13, 2026, 10:30 – Oct 13, 2026, 12:00',
    );
  });
});

describe('previousPeriodIn', () => {
  const tz = 'Europe/Copenhagen';

  it('is the same calendar days just before, up to the same time of day', () => {
    // Last 7 days at 15:30 on Oct 23 in Copenhagen: Oct 17 00:00 to Oct 23 15:30 (UTC+2)
    const previous = previousPeriodIn({ from: new Date('2026-10-16T22:00:00Z'), to: new Date('2026-10-23T13:30:00Z') }, tz);
    expect(previous).toEqual({ from: new Date('2026-10-09T22:00:00Z'), to: new Date('2026-10-16T13:30:00Z') });
  });

  it('keeps local midnight across a summer time change', () => {
    // Oct 26 – Nov 1 (after the change to UTC+1) compares with Oct 19 – Oct 25 (UTC+2)
    const previous = previousPeriodIn({ from: new Date('2026-10-25T23:00:00Z'), to: new Date('2026-11-01T23:00:00Z') }, tz);
    expect(previous).toEqual({ from: new Date('2026-10-18T22:00:00Z'), to: new Date('2026-10-25T23:00:00Z') });
  });

  it('compares a rolling period with the same length before', () => {
    const previous = previousPeriodIn({ from: new Date('2026-10-22T13:30:00Z'), to: new Date('2026-10-23T13:30:00Z') }, tz);
    expect(previous).toEqual({ from: new Date('2026-10-21T13:30:00Z'), to: new Date('2026-10-22T13:30:00Z') });
  });
});
