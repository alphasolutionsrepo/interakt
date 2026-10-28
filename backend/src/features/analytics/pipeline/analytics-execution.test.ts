// src/features/analytics/pipeline/analytics-execution.test.ts

/**
 * The period each analytics tool runs for: the days the planner named, or the
 * page's period when the planner named none or named days that can't be one.
 */

import { describe, expect, it } from 'vitest';

import { resolveToolPeriod } from './analytics-execution';

const now = new Date('2026-10-27T12:00:00Z');
const tz = 'Europe/Copenhagen';
const pagePeriod = { from: new Date('2026-10-20T22:00:00Z'), to: now };

describe('resolveToolPeriod', () => {
  it('uses the days the planner named, in the viewer’s time zone', () => {
    expect(resolveToolPeriod({ from: '2026-10-13', to: '2026-10-13' }, pagePeriod, tz, now)).toEqual({
      from: new Date('2026-10-12T22:00:00.000Z'),
      to: new Date('2026-10-13T22:00:00.000Z'),
    });
  });

  it('uses the page period when the planner named none', () => {
    expect(resolveToolPeriod({ limit: 10 }, pagePeriod, tz, now)).toBe(pagePeriod);
  });

  it('uses the page period for a day that hasn’t started, not a period that ends before it begins', () => {
    expect(resolveToolPeriod({ from: '2026-10-30', to: '2026-10-30' }, pagePeriod, tz, now)).toBe(pagePeriod);
  });

  it('uses the page period for dates in the wrong order or not dates at all', () => {
    expect(resolveToolPeriod({ from: '2026-10-14', to: '2026-10-13' }, pagePeriod, tz, now)).toBe(pagePeriod);
    expect(resolveToolPeriod({ from: 'last week', to: 'today' }, pagePeriod, tz, now)).toBe(pagePeriod);
  });
});
