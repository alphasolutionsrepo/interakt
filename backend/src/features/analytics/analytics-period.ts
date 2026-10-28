// src/features/analytics/analytics-period.ts

/**
 * An explicit period on an analytics request: `from` and `to` (ISO instants)
 * and the viewer's time zone. The analytics pages always send one, so "today",
 * "last month" and a custom range mean the same thing to every query, and days
 * are grouped at the viewer's midnight rather than UTC's.
 */

export interface RequestedPeriod {
  from: Date;
  to: Date;
}

/** Longest period a request may cover (a year and a bit) */
const MAX_SPAN_MS = 400 * 24 * 60 * 60 * 1000;

/** An IANA time zone Postgres and the runtime both understand, e.g. "Europe/Copenhagen" */
export function isValidTimeZone(value: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The period in `from`/`to`, or undefined when the request names none (callers
 * then use their preset). Throws on a period that is malformed, backwards or
 * longer than a year, so handlers can answer 400.
 */
export function readRequestedPeriod(params: URLSearchParams): RequestedPeriod | undefined {
  const fromRaw = params.get('from');
  const toRaw = params.get('to');
  if (!fromRaw && !toRaw) return undefined;
  if (!fromRaw || !toRaw) throw new PeriodError('A period needs both from and to');

  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new PeriodError('from and to must be ISO dates');
  if (from >= to) throw new PeriodError('from must be before to');
  if (to.getTime() - from.getTime() > MAX_SPAN_MS) throw new PeriodError('A period can cover at most 400 days');
  return { from, to };
}

/** The viewer's time zone from `tz`, or UTC when absent. Throws on an unknown zone. */
export function readTimeZone(params: URLSearchParams): string {
  const tz = params.get('tz');
  if (!tz) return 'UTC';
  if (!isValidTimeZone(tz)) throw new PeriodError(`Unknown time zone: ${tz}`);
  return tz;
}

export class PeriodError extends Error {}

// ============================================================================
// CALENDAR DAYS IN A TIME ZONE
// ============================================================================

/** How far `timeZone`'s wall clock is ahead of UTC at `instant`, in ms */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallClockAsUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  return wallClockAsUtc - instant.getTime();
}

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Midnight at the start of calendar day `date` ("2026-10-13") in `timeZone`, as an instant */
export function startOfDayIn(date: string, timeZone: string): Date {
  const match = CALENDAR_DAY.exec(date);
  if (!match) throw new PeriodError(`Not a calendar day: ${date}`);
  const midnightUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // The zone's offset can change around midnight (summer time), so check it at the result
  let instant = midnightUtc - zoneOffsetMs(new Date(midnightUtc), timeZone);
  instant = midnightUtc - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** The instants calendar days `from`..`to` (inclusive) cover in `timeZone`, ending no later than now */
export function calendarDaysIn(from: string, to: string, timeZone: string, now: Date = new Date()): RequestedPeriod {
  const start = startOfDayIn(from, timeZone);
  const match = CALENDAR_DAY.exec(to);
  if (!match) throw new PeriodError(`Not a calendar day: ${to}`);
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  const end = startOfDayIn(next.toISOString().slice(0, 10), timeZone);
  if (start >= end) throw new PeriodError('from must not be after to');
  // A day that hasn't started has no data, and capping `to` at now would put it before `from`
  if (start > now) throw new PeriodError(`${from} hasn't started yet`);
  return { from: start, to: end > now ? now : end };
}

/** The wall-clock moment `days` calendar days before `instant` in `timeZone` (same time of day) */
function daysEarlierIn(instant: Date, days: number, timeZone: string): Date {
  const wall = instant.getTime() + zoneOffsetMs(instant, timeZone) - days * 86_400_000;
  // As in startOfDayIn: the offset may differ on the earlier day (summer time)
  let earlier = wall - zoneOffsetMs(new Date(wall), timeZone);
  earlier = wall - zoneOffsetMs(new Date(earlier), timeZone);
  return new Date(earlier);
}

/** Calendar day of `instant` in `timeZone`, as "2026-10-13" */
function calendarDayOf(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/**
 * The period to compare with, as the analytics page does: the same calendar
 * days just before, up to the same time of day (the last 7 days up to 15:30
 * compares with the 7 days before, up to 15:30). A period that doesn't start
 * at midnight, like the last 24 hours, compares with the same length before.
 */
export function previousPeriodIn(period: RequestedPeriod, timeZone: string): RequestedPeriod {
  if (!isMidnightIn(period.from, timeZone)) {
    const length = period.to.getTime() - period.from.getTime();
    return { from: new Date(period.from.getTime() - length), to: period.from };
  }
  // Calendar days the period touches; ending at midnight doesn't touch the next day
  const first = Date.parse(calendarDayOf(period.from, timeZone));
  const last = Date.parse(calendarDayOf(new Date(period.to.getTime() - 1), timeZone));
  const days = Math.round((last - first) / 86_400_000) + 1;
  return { from: daysEarlierIn(period.from, days, timeZone), to: daysEarlierIn(period.to, days, timeZone) };
}

/**
 * A period in words for an answer: "Oct 13, 2026", "Oct 1 – Oct 13, 2026", or
 * with times when it doesn't start and end at midnight in `timeZone`.
 */
export function describePeriod(period: RequestedPeriod, timeZone: string): string {
  const atMidnight = (d: Date) => isMidnightIn(d, timeZone);
  const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' });
  const timeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone, month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  if (atMidnight(period.from) && atMidnight(period.to)) {
    // `to` is the midnight after the last day
    const lastDay = new Date(period.to.getTime() - 1);
    const first = dayFmt.format(period.from);
    const last = dayFmt.format(lastDay);
    return first === last ? first : `${first} – ${last}`;
  }
  return `${timeFmt.format(period.from)} – ${timeFmt.format(period.to)}`;
}

function isMidnightIn(instant: Date, timeZone: string): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(instant);
  return parts.filter((p) => p.type !== 'literal').every((p) => Number(p.value) === 0);
}
