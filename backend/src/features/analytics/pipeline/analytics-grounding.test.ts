// src/features/analytics/pipeline/analytics-grounding.test.ts

/**
 * Figures in an answer are matched against the tools' output, allowing for
 * rounding; dates, times, small counts and follow-up questions are not checked.
 */

import { describe, expect, it } from 'vitest';

import { findUnsupportedFigures } from './analytics-grounding';

const output = [
  'Search Analytics Overview:\n- Total Searches: 1,048\n- Zero Result Rate: 6.6%',
  { totalSearches: 1048, zeroResultRate: 0.0658, avgSearchDurationMs: 348.4, uniqueQueries: 250 },
];

describe('findUnsupportedFigures', () => {
  it('accepts figures the data contains, rounded as written', () => {
    expect(
      findUnsupportedFigures('There were 1,048 searches (250 distinct), 6.6% or about 7% found nothing, at 348 ms.', output),
    ).toEqual([]);
  });

  it('accepts compact thousands', () => {
    expect(findUnsupportedFigures('About 1.0K searches ran.', output)).toEqual([]);
  });

  it('flags figures the data does not contain', () => {
    expect(findUnsupportedFigures('On October 13 there were 81 searches and 41 unique queries.', output)).toEqual(['81', '41']);
  });

  it('ignores dates, times, years, small counts and follow-up questions', () => {
    const answer = 'Between Oct 13 and 14 Oct 2026 (from 09:00), 3 tools ran.\n- What happened on 2026-10-13?\n- Why 55 failures?';
    expect(findUnsupportedFigures(answer, output)).toEqual([]);
  });

  it('accepts a decline stated in words, and ignores digits that are part of a name', () => {
    const comparison = ['- Searches: 100 → 88 (-12%)', '- Share of searches with no results: 8.0% → 5.0% (-3.0 points)'];
    expect(findUnsupportedFigures('Searches fell 12%, and the no-result share dropped 3.0 points.', comparison)).toEqual([]);
    expect(findUnsupportedFigures('The p95 latency and top10 queries look fine on gpt-4o.', output)).toEqual([]);
  });

  it('reads scale words like the abbreviations', () => {
    expect(findUnsupportedFigures('About 1.0 thousand searches ran, roughly 0.001 million.', output)).toEqual([]);
    expect(findUnsupportedFigures('Over 2.4 million tokens were used.', output)).toEqual(['2.4 million']);
  });

  it('ignores periods named by their length, but not counts of days', () => {
    expect(findUnsupportedFigures('Over the last 30 days, and in the past 24 hours, in a 90-day view.', output)).toEqual([]);
    expect(findUnsupportedFigures('Searches failed on 37 days.', output)).toEqual(['37']);
  });
});
