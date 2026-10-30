// app/analytics/_components/viz/change.ts

/**
 * How a headline figure moved since the previous period. Counts and durations
 * change by a percentage; rates change by percentage points, since "+10%" of a
 * 5% rate is ambiguous. Whether up is good depends on the figure, and some
 * (how many searches there were) are neither.
 */

export type ChangeSentiment = 'good' | 'bad' | 'neutral';

export interface Change {
  direction: 'up' | 'down' | 'flat';
  /** "12%", "3 pts", "4×" (no sign; direction carries it) */
  amount: string;
  sentiment: ChangeSentiment;
}

interface CompareOptions {
  /** true: up is good · false: down is good · undefined: neither */
  higherIsBetter?: boolean;
}

function sentimentOf(direction: Change['direction'], higherIsBetter: boolean | undefined): ChangeSentiment {
  if (direction === 'flat' || higherIsBetter === undefined) return 'neutral';
  return (direction === 'up') === higherIsBetter ? 'good' : 'bad';
}

/** Relative change of a count or duration. Null when there's nothing to compare with. */
export function compareValues(current: number, previous: number, { higherIsBetter }: CompareOptions = {}): Change | null {
  if (!(previous > 0) || !Number.isFinite(current)) return null;
  const ratio = current / previous;
  const percent = Math.round(Math.abs(ratio - 1) * 100);
  const direction = percent === 0 ? 'flat' : ratio > 1 ? 'up' : 'down';
  // Past +999% a multiple reads better
  const amount = ratio >= 10 ? `${Math.round(ratio)}×` : `${percent}%`;
  return { direction, amount, sentiment: sentimentOf(direction, higherIsBetter) };
}

/** Change of a rate (0–1), in percentage points. Null when either side has no data. */
export function compareRates(
  current: number | null,
  previous: number | null,
  { higherIsBetter }: CompareOptions = {},
): Change | null {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous)) return null;
  const points = (current - previous) * 100;
  const rounded = Math.abs(points) < 10 ? Math.round(Math.abs(points) * 10) / 10 : Math.round(Math.abs(points));
  const direction = rounded === 0 ? 'flat' : points > 0 ? 'up' : 'down';
  return { direction, amount: `${rounded} ${rounded === 1 ? 'pt' : 'pts'}`, sentiment: sentimentOf(direction, higherIsBetter) };
}
