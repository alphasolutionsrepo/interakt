// app/analytics/_components/viz/time-buckets.ts

/**
 * Time buckets for the trend charts. The server groups events by hour, day or
 * week in the viewer's time zone and only returns buckets that have events.
 * Charts need every bucket in the period, so empty ones are filled with zeros
 * here instead of being drawn as a line across the gap. The browser is in the
 * viewer's time zone, so local time is the same clock the server grouped by.
 */

export type Granularity = 'hour' | 'day' | 'week';

const HOUR = 3_600_000;

/** Mirrors getGranularityForRange in analytics-query.service.ts */
export function granularityForSpan(from: Date, to: Date): Granularity {
  const hours = (to.getTime() - from.getTime()) / HOUR;
  if (hours <= 48) return 'hour';
  if (hours <= 92 * 24) return 'day';
  return 'week';
}

/** Start of the bucket containing `time`, on the local clock. */
export function bucketStart(time: number, granularity: Granularity): number {
  const d = new Date(time);
  if (granularity === 'hour') {
    d.setMinutes(0, 0, 0);
    return d.getTime();
  }
  d.setHours(0, 0, 0, 0);
  // Weeks start on Monday, as Postgres date_trunc('week') does
  if (granularity === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function nextBucket(start: number, granularity: Granularity): number {
  const d = new Date(start);
  if (granularity === 'hour') d.setHours(d.getHours() + 1);
  else d.setDate(d.getDate() + (granularity === 'day' ? 1 : 7));
  return d.getTime();
}

/** Every bucket start from the start of the period up to its end. */
export function bucketsInPeriod(from: Date, to: Date, granularity: Granularity): number[] {
  const buckets: number[] = [];
  const end = to.getTime();
  for (let t = bucketStart(from.getTime(), granularity); t < end; t = nextBucket(t, granularity)) {
    buckets.push(t);
  }
  return buckets;
}

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const fullHourFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});
const fullDayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** Axis label for a bucket. A week of days reads best by weekday, longer periods by date. */
export function formatTick(time: number, granularity: Granularity, bucketCount: number): string {
  if (granularity === 'hour') return timeFmt.format(time);
  if (granularity === 'day' && bucketCount <= 8) return weekdayFmt.format(time);
  return dayFmt.format(time);
}

/** Tooltip and table label for one bucket. */
export function formatBucket(time: number, granularity: Granularity): string {
  if (granularity === 'hour') return fullHourFmt.format(time);
  if (granularity === 'day') return fullDayFmt.format(time);
  return `Week of ${dayFmt.format(time)}`;
}

/** A run of buckets picked on a chart: `from` and `to` are bucket starts, both included */
export interface BucketRange {
  from: number;
  to: number;
}

/** The instant the bucket starting at `start` ends */
export function bucketEnd(start: number, granularity: Granularity): number {
  return nextBucket(start, granularity);
}

const datedFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** "Mon, Oct 13", "Oct 3 – Oct 9" or "Mon, Oct 13, 14:00 – 17:00" */
export function formatBucketRange({ from, to }: BucketRange, granularity: Granularity): string {
  if (from === to) return formatBucket(from, granularity);
  const lastDay = bucketEnd(to, granularity) - 1;
  if (granularity === 'hour') {
    const sameDay = new Date(from).toDateString() === new Date(lastDay).toDateString();
    return sameDay
      ? `${fullDayFmt.format(from)}, ${timeFmt.format(from)} – ${timeFmt.format(bucketEnd(to, granularity))}`
      : `${fullHourFmt.format(from)} – ${fullHourFmt.format(bucketEnd(to, granularity))}`;
  }
  return `${dayFmt.format(from)} – ${dayFmt.format(lastDay)}`;
}

/** The same range in words a question can carry: "on Oct 13, 2026", "between Oct 3, 2026 and Oct 9, 2026" */
export function describeBucketRange({ from, to }: BucketRange, granularity: Granularity): string {
  const lastDay = bucketEnd(to, granularity) - 1;
  if (granularity === 'hour') {
    const hours = `${timeFmt.format(from)} and ${timeFmt.format(bucketEnd(to, granularity))}`;
    return new Date(from).toDateString() === new Date(lastDay).toDateString()
      ? `on ${datedFmt.format(from)} between ${hours}`
      : `between ${fullHourFmt.format(from)} and ${fullHourFmt.format(bucketEnd(to, granularity))}`;
  }
  if (granularity === 'day' && from === to) return `on ${datedFmt.format(from)}`;
  return `between ${datedFmt.format(from)} and ${datedFmt.format(lastDay)}`;
}

/** Hourly charts label every 4th whole hour; day and week charts let the chart space labels. */
export function pickTicks(buckets: number[], granularity: Granularity): number[] | undefined {
  if (granularity !== 'hour' || buckets.length <= 6) return undefined;
  const ticks = buckets.filter((t) => new Date(t).getHours() % 4 === 0);
  return ticks.length > 1 ? ticks : undefined;
}
