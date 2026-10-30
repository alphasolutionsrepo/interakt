// app/analytics/_lib/period.ts

/**
 * The period the analytics pages show: a preset ("Last 7 days", "This month")
 * or a custom pair of dates. Periods are worked out in the viewer's time zone,
 * and day presets start at midnight there, so every day bar is a whole day.
 * Rolling presets are resolved when data is fetched, so "now" stays current.
 */

import type { TimeRange } from './hooks/useAnalytics';

export type PeriodPreset = 'today' | 'yesterday' | '24h' | '7d' | '30d' | '90d' | 'this_month' | 'last_month';

/** A preset, or custom dates as local calendar days (YYYY-MM-DD), both inclusive */
export type Period = { preset: PeriodPreset } | { from: string; to: string };

export const PERIOD_PRESETS: ReadonlyArray<{ preset: PeriodPreset; label: string }> = [
  { preset: 'today', label: 'Today' },
  { preset: 'yesterday', label: 'Yesterday' },
  { preset: '24h', label: 'Last 24 hours' },
  { preset: '7d', label: 'Last 7 days' },
  { preset: '30d', label: 'Last 30 days' },
  { preset: '90d', label: 'Last 90 days' },
  { preset: 'this_month', label: 'This month' },
  { preset: 'last_month', label: 'Last month' },
];

export const DEFAULT_PERIOD: Period = { preset: '7d' };

export interface ResolvedPeriod {
  from: Date;
  to: Date;
}

const HOUR = 3_600_000;

/** Midnight at the start of `date`'s day, `offsetDays` days away, in local time */
function localMidnight(date: Date, offsetDays = 0): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

/** "2026-10-13" → local midnight that day */
function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isCustom(period: Period): period is { from: string; to: string } {
  return 'from' in period;
}

/** The exact instants a period covers, as of `now` */
export function resolvePeriod(period: Period, now: Date = new Date()): ResolvedPeriod {
  if (isCustom(period)) {
    const to = localMidnight(parseLocalDate(period.to), 1);
    return { from: parseLocalDate(period.from), to: to > now ? now : to };
  }
  switch (period.preset) {
    case 'today':
      return { from: localMidnight(now), to: now };
    case 'yesterday':
      return { from: localMidnight(now, -1), to: localMidnight(now) };
    case '24h':
      return { from: new Date(now.getTime() - 24 * HOUR), to: now };
    case '7d':
      return { from: localMidnight(now, -6), to: now };
    case '30d':
      return { from: localMidnight(now, -29), to: now };
    case '90d':
      return { from: localMidnight(now, -89), to: now };
    case 'this_month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    case 'last_month':
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) };
  }
}

function shiftDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

/** The same moment `months` months earlier, kept within that month (Mar 31 → Feb 28) */
function shiftMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() - months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(
    target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay),
    date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds(),
  );
}

/**
 * The period to compare with: the same calendar days just before, up to the
 * same time of day, so a period that runs to now is compared like for like.
 * Last 7 days at 15:30 compares with the 7 days before, up to 15:30 on the
 * last of them; this month compares with last month up to the same date.
 */
export function previousPeriod(period: Period, now: Date = new Date()): ResolvedPeriod {
  const { from, to } = resolvePeriod(period, now);
  if (!isCustom(period)) {
    if (period.preset === '24h') return { from: new Date(from.getTime() - 24 * HOUR), to: from };
    if (period.preset === 'this_month') return { from: shiftMonths(from, 1), to: shiftMonths(to, 1) };
    if (period.preset === 'last_month') return { from: shiftMonths(from, 1), to: from };
  }
  // Calendar days the period touches; a period ending at midnight doesn't touch the next day
  const days = Math.round((localMidnight(new Date(to.getTime() - 1), 1).getTime() - from.getTime()) / (24 * HOUR));
  return { from: shiftDays(from, days), to: shiftDays(to, days) };
}

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
const dayTimeFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

/** "Oct 12 – Oct 18", "Oct 12", "Oct 12 – Oct 18, 15:30" when it stops partway through a day */
export function formatSpan({ from, to }: ResolvedPeriod): string {
  const startsAtMidnight = from.getTime() === localMidnight(from).getTime();
  if (!startsAtMidnight) return `${dayTimeFmt.format(from)} – ${dayTimeFmt.format(to)}`;
  const endsAtMidnight = to.getTime() === localMidnight(to).getTime();
  const last = endsAtMidnight ? new Date(to.getTime() - 1) : to;
  const days = localMidnight(from).getTime() === localMidnight(last).getTime()
    ? dayFmt.format(from)
    : `${dayFmt.format(from)} – ${dayFmt.format(last)}`;
  return endsAtMidnight ? days : `${days}, to ${timeFmt.format(to)}`;
}

const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const dayYearFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** "Last 7 days", or "Oct 1 – Oct 13" for custom dates */
export function periodLabel(period: Period, now: Date = new Date()): string {
  if (!isCustom(period)) return PERIOD_PRESETS.find((p) => p.preset === period.preset)?.label ?? period.preset;
  const from = parseLocalDate(period.from);
  const to = parseLocalDate(period.to);
  const fmt = from.getFullYear() === now.getFullYear() && to.getFullYear() === now.getFullYear() ? dayFmt : dayYearFmt;
  return period.from === period.to ? fmt.format(from) : `${fmt.format(from)} – ${fmt.format(to)}`;
}

/** Stable identity of a period, for cache keys (rolling presets don't change key as time passes) */
export function periodKey(period: Period): string {
  return isCustom(period) ? `${period.from}..${period.to}` : period.preset;
}

/**
 * The nearest fixed range, for what still only understands those: stored
 * insights (24 h, 7 d, 30 d) and the analytics chat until it takes dates.
 */
export function approximateTimeRange(period: Period, now: Date = new Date()): TimeRange {
  const { from, to } = resolvePeriod(period, now);
  const hours = (to.getTime() - from.getTime()) / HOUR;
  if (hours <= 26) return '24h';
  if (hours <= 8 * 24) return '7d';
  if (hours <= 32 * 24) return '30d';
  return '90d';
}

/** The viewer's IANA time zone, e.g. "Europe/Copenhagen" */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Query parameters an analytics API call carries for a period */
export function periodParams(period: Period, now: Date = new Date()): Record<string, string> {
  const { from, to } = resolvePeriod(period, now);
  return { timeRange: 'custom', from: from.toISOString(), to: to.toISOString(), tz: browserTimeZone() };
}

// ============================================================================
// URL
// ============================================================================

const PRESET_IDS = new Set<string>(PERIOD_PRESETS.map((p) => p.preset));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `?range=7d` or `?from=2026-10-01&to=2026-10-13` */
export function periodFromParams(params: URLSearchParams): Period | null {
  const from = params.get('from');
  const to = params.get('to');
  if (from && to && DATE.test(from) && DATE.test(to) && from <= to) return { from, to };
  const range = params.get('range');
  if (range && PRESET_IDS.has(range)) return { preset: range as PeriodPreset };
  // Older links used 1h, which no longer exists as a preset
  if (range === '1h') return { preset: '24h' };
  return null;
}

export function writePeriodParams(url: URL, period: Period): void {
  url.searchParams.delete('range');
  url.searchParams.delete('from');
  url.searchParams.delete('to');
  if (isCustom(period)) {
    url.searchParams.set('from', period.from);
    url.searchParams.set('to', period.to);
  } else {
    url.searchParams.set('range', period.preset);
  }
}

/** A period serialised for session storage */
export function serializePeriod(period: Period): string {
  return isCustom(period) ? `${period.from}..${period.to}` : period.preset;
}

export function parsePeriod(value: string | null): Period | null {
  if (!value) return null;
  const [from, to] = value.split('..');
  if (to !== undefined) return DATE.test(from) && DATE.test(to) && from <= to ? { from, to } : null;
  return PRESET_IDS.has(value) ? { preset: value as PeriodPreset } : value === '1h' ? { preset: '24h' } : null;
}

export { formatLocalDate as toLocalDate, parseLocalDate as fromLocalDate };
