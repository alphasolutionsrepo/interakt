// src/features/chat/summary-context.ts

/**
 * Choose which part of a result's long text the AI summary reads.
 *
 * Page text often opens with a header block (college, duration, credits) and puts
 * the substance further down: specializations, requirements, steps. Cutting at a
 * fixed length keeps only the header. Instead keep the opening plus the passages
 * that match the query, in page order, within a character budget.
 */

/** Characters of the opening kept regardless of the query: header facts live there. */
const OPENING_CHARS = 300;

/** Lines longer than this are split into sentences so one paragraph can't take the budget. */
const MAX_UNIT_CHARS = 600;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does', 'for', 'from', 'get',
  'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'the', 'to', 'what', 'when',
  'where', 'which', 'who', 'why', 'with', 'you', 'your', 'about', 'there', 'their', 'this', 'that',
]);

/** Query terms worth matching: lowercase, no stop words, simple plural folding. */
export function queryTerms(query: string): string[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
    .map((t) => (t.length > 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
  return [...new Set(terms)];
}

interface Unit {
  text: string;
  index: number;
  heading: boolean;
}

/** Split text into lines (headings, paragraphs, table rows); long lines into sentences. */
function toUnits(text: string): Unit[] {
  const units: Unit[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.length > MAX_UNIT_CHARS ? trimmed.split(/(?<=[.!?])\s+/) : [trimmed];
    for (const part of parts) {
      units.push({ text: part, index: units.length, heading: /^#{1,6}\s/.test(part) });
    }
  }
  return units;
}

/** Cut at a word boundary at or before `max` characters. */
function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return space > max * 0.6 ? cut.slice(0, space) : cut;
}

/**
 * Reduce `text` to at most about `budget` characters: the opening, then the
 * query-matching passages (with the heading above each), in original order and
 * joined with "…" where text was skipped. Text within the budget is returned whole.
 */
export function selectPassages(text: string, query: string, budget: number): string {
  if (text.length <= budget) return text;

  const units = toUnits(text);
  const terms = queryTerms(query);
  const chosen = new Set<number>();
  let used = 0;

  // The opening, up to OPENING_CHARS (or the whole budget when it is small)
  const openingLimit = Math.min(OPENING_CHARS, budget);
  for (const unit of units) {
    if (used + unit.text.length > openingLimit) break;
    chosen.add(unit.index);
    used += unit.text.length + 1;
  }

  // Then the passages that match the most query terms, best first
  const scored = units
    .filter((u) => !chosen.has(u.index))
    .map((u) => {
      const lower = u.text.toLowerCase();
      return { unit: u, score: terms.filter((t) => lower.includes(t)).length };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.unit.index - b.unit.index);

  const headingAbove = (index: number): Unit | undefined => {
    for (let i = index - 1; i >= 0; i--) if (units[i].heading) return units[i];
    return undefined;
  };

  for (const { unit } of scored) {
    if (used + unit.text.length > budget) continue;
    chosen.add(unit.index);
    used += unit.text.length + 1;
    // The heading above a passage tells the model what it is about
    const heading = headingAbove(unit.index);
    if (heading && !chosen.has(heading.index) && used + heading.text.length <= budget) {
      chosen.add(heading.index);
      used += heading.text.length + 1;
    }
  }

  // Nothing matched beyond the opening: continue reading from the top instead
  if (chosen.size === 0 || scored.length === 0) {
    for (const unit of units) {
      if (chosen.has(unit.index)) continue;
      if (used + unit.text.length > budget) break;
      chosen.add(unit.index);
      used += unit.text.length + 1;
    }
  }

  // An opening unit longer than the budget: fall back to a word-boundary cut
  if (chosen.size === 0) return `${cutAtWord(text, budget)}…`;

  const lines: string[] = [];
  let previous = -1;
  for (const unit of units) {
    if (!chosen.has(unit.index)) continue;
    if (previous !== -1 && unit.index !== previous + 1) lines.push('…');
    lines.push(unit.text);
    previous = unit.index;
  }
  if (previous !== units.length - 1) lines.push('…');
  return lines.join('\n');
}

/**
 * Apply `selectPassages` to each string field longer than the budget. Other values
 * are returned unchanged.
 */
export function selectFieldPassages(
  fields: Record<string, unknown>,
  query: string,
  budget: number,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      typeof value === 'string' && value.length > budget ? selectPassages(value, query, budget) : value,
    ]),
  );
}
