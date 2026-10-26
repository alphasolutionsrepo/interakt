// app/analytics/_components/viz/time-buckets.test.ts

/**
 * A range picked on a chart is named for the screen and for a question to the
 * analytics chat. Bucket starts are built in local time, so assertions hold in
 * whatever time zone the tests run in.
 */

import { describe, expect, it } from 'vitest';

import { bucketEnd, describeBucketRange, formatBucketRange } from './time-buckets';

const oct = (day: number, hour = 0) => new Date(2026, 9, day, hour).getTime();

describe('bucketEnd', () => {
  it('ends a day at the next midnight and a week seven days later', () => {
    expect(bucketEnd(oct(13), 'day')).toBe(oct(14));
    expect(bucketEnd(oct(12), 'week')).toBe(oct(19));
    expect(bucketEnd(oct(13, 14), 'hour')).toBe(oct(13, 15));
  });
});

describe('formatBucketRange', () => {
  it('names one day, a run of days, and the last day of the last week', () => {
    expect(formatBucketRange({ from: oct(13), to: oct(13) }, 'day')).toBe('Tue, Oct 13');
    expect(formatBucketRange({ from: oct(3), to: oct(9) }, 'day')).toBe('Oct 3 – Oct 9');
    expect(formatBucketRange({ from: oct(5), to: oct(12) }, 'week')).toBe('Oct 5 – Oct 18');
  });

  it('names hours on one day by their times, up to the end of the last hour', () => {
    expect(formatBucketRange({ from: oct(13, 14), to: oct(13, 16) }, 'hour')).toBe('Tue, Oct 13, 14:00 – 17:00');
  });
});

describe('describeBucketRange', () => {
  it('words the range with the year, for a question', () => {
    expect(describeBucketRange({ from: oct(13), to: oct(13) }, 'day')).toBe('on Oct 13, 2026');
    expect(describeBucketRange({ from: oct(3), to: oct(9) }, 'day')).toBe('between Oct 3, 2026 and Oct 9, 2026');
    expect(describeBucketRange({ from: oct(12), to: oct(12) }, 'week')).toBe('between Oct 12, 2026 and Oct 18, 2026');
    expect(describeBucketRange({ from: oct(13, 14), to: oct(13, 14) }, 'hour')).toBe('on Oct 13, 2026 between 14:00 and 15:00');
  });
});
