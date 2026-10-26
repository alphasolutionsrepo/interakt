// app/analytics/_components/viz/format.ts

/**
 * Number and time formatting shared by the analytics charts, so every card writes
 * counts, rates and durations the same way.
 */

/** 1,284 · 12.9K · 4.2M */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${trimZero((value / 1_000_000).toFixed(1))}M`;
  if (abs >= 10_000) return `${trimZero((value / 1_000).toFixed(1))}K`;
  return Math.round(value).toLocaleString('en-US');
}

/** 0.1234 → "12.3%" */
export function formatPercent(rate: number | null | undefined, digits = 1): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '0%';
  return `${trimZero((rate * 100).toFixed(digits))}%`;
}

/** 840 → "840 ms" · 1840 → "1.8 s" */
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '—';
  if (ms >= 1000) return `${trimZero((ms / 1000).toFixed(1))} s`;
  return `${Math.round(ms)} ms`;
}

export function formatTimeAgo(date: string | Date): string {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatCompact(count)} ${count === 1 ? singular : plural}`;
}

function trimZero(text: string): string {
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}
