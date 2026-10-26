// src/features/analytics/pipeline/analytics-grounding.ts

/**
 * Checks the figures in an analytics answer against the data its tools
 * returned. A figure the data doesn't contain (allowing for rounding) is
 * flagged to the reader, so an invented or misattributed number is visible.
 */

/** A figure in the answer: as written, and its value */
interface Figure {
  text: string;
  value: number;
  decimals: number;
  kind: 'plain' | 'percent' | 'thousands' | 'millions' | 'billions';
}

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
// Dates and times are periods, not figures: "Oct 13", "13 Oct", "2026-10-13", "14:00"
const DATE_OR_TIME = new RegExp(
  `\\b(?:${MONTHS})[a-z]*\\.?\\s+\\d{1,2}(?:,\\s*\\d{4})?|\\b\\d{1,2}\\s+(?:${MONTHS})[a-z]*(?:\\s+\\d{4})?|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}:\\d{2}\\b`,
  'gi',
);
// Periods named by length are not figures either: "the last 30 days", "past 24 hours", "a 7-day period"
const PERIOD_LENGTH =
  /\b(?:last|past|previous|prior|next|recent|over|within|in)\s+(?:the\s+)?\d+\s+(?:hours?|days?|weeks?|months?)\b|\b\d+-(?:hour|day|week|month)\b/gi;
// Numbers that stand alone; digits that are part of a name ("p95", "top10") are not figures
const FIGURE = /(?<![A-Za-z_\d.])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(%|k\b|m\b|thousand\b|million\b|billion\b)?/gi;

function figuresIn(answer: string): Figure[] {
  // Follow-up suggestions ("- How does …?") are questions, not claims
  const claims = answer
    .split('\n')
    .filter((line) => !/^\s*-\s+/.test(line))
    .join('\n')
    .replace(DATE_OR_TIME, ' ')
    .replace(PERIOD_LENGTH, ' ');

  const figures: Figure[] = [];
  for (const match of claims.matchAll(FIGURE)) {
    const whole = match[1].replace(/,/g, '');
    const decimals = match[2] ? match[2].length - 1 : 0;
    const value = Number(whole + (match[2] ?? ''));
    const suffix = match[3]?.toLowerCase();
    const kind =
      suffix === '%' ? 'percent'
      : suffix === 'k' || suffix === 'thousand' ? 'thousands'
      : suffix === 'm' || suffix === 'million' ? 'millions'
      : suffix === 'billion' ? 'billions'
      : 'plain';
    // Small whole numbers ("2 tools", "3 queries") are too common to check meaningfully
    if (kind === 'plain' && decimals === 0 && value < 10) continue;
    // Years
    if (kind === 'plain' && decimals === 0 && value >= 1990 && value <= 2100) continue;
    figures.push({ text: match[0].trim(), value, decimals, kind });
  }
  return figures;
}

/** Every number in the tools' output, from their text and their raw data */
function numbersIn(sources: unknown[]): number[] {
  const numbers: number[] = [];
  const visit = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) numbers.push(value);
    else if (typeof value === 'string') {
      for (const m of value.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)) numbers.push(Number(m[0].replace(/,/g, '')));
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  sources.forEach(visit);
  return numbers;
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function supported(figure: Figure, numbers: number[]): boolean {
  return numbers.some((signed) => {
    // Answers state a change in words ("fell 12%") where the data has its sign (-12%)
    const n = Math.abs(signed);
    // The data may hold a rate (0.934) or a percentage (93.4) for "93.4%"
    const candidates =
      figure.kind === 'percent' ? [n, n * 100]
      : figure.kind === 'thousands' ? [n / 1000]
      : figure.kind === 'millions' ? [n / 1_000_000]
      : figure.kind === 'billions' ? [n / 1_000_000_000]
      : [n];
    return candidates.some((c) => Math.abs(round(c, figure.decimals) - figure.value) < 1e-9);
  });
}

/**
 * Figures in `answer` that none of the tools' output contains. An empty list
 * means every figure was found (or there were none to check).
 */
export function findUnsupportedFigures(answer: string, toolOutputs: unknown[]): string[] {
  const numbers = numbersIn(toolOutputs);
  const unsupported = figuresIn(answer)
    .filter((figure) => !supported(figure, numbers))
    .map((figure) => figure.text);
  return [...new Set(unsupported)];
}
