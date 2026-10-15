// widgets/src/search/summary-format.ts

/**
 * Parse an AI summary into a small, safe structure for rendering:
 * paragraphs and bullet lists of inline runs (text, **bold**, citations).
 *
 * Citations are the result numbers the summarize prompt uses ([1] … [n], in the
 * order results were sent). `[1]`, `[1][3]` and `[1, 3]` all parse to citation
 * runs. Nothing here produces HTML, so model output can never inject markup.
 */

export type InlineRun =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'cite'; n: number };

export type SummaryBlock =
  | { kind: 'paragraph'; runs: InlineRun[] }
  | { kind: 'list'; items: InlineRun[][] };

const CITATION = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/;
// A citation group with the space before it and punctuation right after it
const CITATION_GROUP = /\s*((?:\[\d+(?:\s*,\s*\d+)*\])+)([.,;:]?)/g;

/** Split one line into text, bold and citation runs. */
export function parseInline(line: string): InlineRun[] {
  // Footnote placement: "claim [1]." reads as "claim.¹", not "claim ¹ ."
  line = line.replace(CITATION_GROUP, '$2$1');
  const runs: InlineRun[] = [];
  // Bold first, then citations inside each plain or bold segment.
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) {
      runs.push(...splitCitations(bold[1], 'bold'));
    } else {
      runs.push(...splitCitations(part, 'text'));
    }
  }
  return mergeText(runs);
}

function splitCitations(text: string, kind: 'text' | 'bold'): InlineRun[] {
  const out: InlineRun[] = [];
  let last = 0;
  for (const m of text.matchAll(CITATION)) {
    const before = text.slice(last, m.index);
    if (before) out.push({ kind, text: before });
    for (const n of m[1].split(',')) out.push({ kind: 'cite', n: Number(n.trim()) });
    last = (m.index ?? 0) + m[0].length;
  }
  const rest = text.slice(last);
  if (rest) out.push({ kind, text: rest });
  return out;
}

function mergeText(runs: InlineRun[]): InlineRun[] {
  const out: InlineRun[] = [];
  for (const r of runs) {
    const prev = out[out.length - 1];
    if (prev && prev.kind === r.kind && r.kind !== 'cite') {
      (prev as { text: string }).text += (r as { text: string }).text;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

/** Parse the whole summary into paragraphs and bullet lists. */
export function parseSummary(text: string): SummaryBlock[] {
  const blocks: SummaryBlock[] = [];
  let paragraph: string[] = [];
  let list: InlineRun[][] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: 'paragraph', runs: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list?.length) blocks.push({ kind: 'list', items: list });
    list = null;
  };

  for (const raw of text.split('\n')) {
    // Headings render as plain lines: the overview is short, a heading adds noise.
    const line = raw.replace(/^\s*#{1,6}\s+/, '').trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      flushParagraph();
      (list ??= []).push(parseInline(bullet[1]));
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

/**
 * The result a list item's lead label points at: when the item opens with a bold label
 * ("**For veterans:** … [2]"), the label links to the item's first citation.
 */
export function labelCitation(runs: InlineRun[]): number | null {
  const first = runs.find((r) => r.kind !== 'text' || r.text.trim() !== '');
  if (first?.kind !== 'bold') return null;
  const cite = runs.find((r) => r.kind === 'cite');
  return cite?.kind === 'cite' ? cite.n : null;
}

/** Citation numbers in order of first appearance, without duplicates. */
export function citedNumbers(blocks: SummaryBlock[]): number[] {
  const seen: number[] = [];
  const visit = (runs: InlineRun[]) => {
    for (const r of runs) if (r.kind === 'cite' && !seen.includes(r.n)) seen.push(r.n);
  };
  for (const b of blocks) {
    if (b.kind === 'paragraph') visit(b.runs);
    else b.items.forEach(visit);
  }
  return seen;
}
