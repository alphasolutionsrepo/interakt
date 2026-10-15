import { describe, it, expect } from 'vitest';

import { parseInline, parseSummary, citedNumbers, labelCitation } from '../src/search/summary-format';

describe('parseInline', () => {
  it('splits bold and citations, in any citation style', () => {
    expect(parseInline('Apply by **March 1** [2][4], see [1, 3].')).toEqual([
      { kind: 'text', text: 'Apply by ' },
      { kind: 'bold', text: 'March 1' },
      { kind: 'text', text: ',' },
      { kind: 'cite', n: 2 },
      { kind: 'cite', n: 4 },
      { kind: 'text', text: ' see.' },
      { kind: 'cite', n: 1 },
      { kind: 'cite', n: 3 },
    ]);
  });

  it('places citations like footnotes, after the punctuation', () => {
    expect(parseInline('Costs are listed [1]. Waivers exist [2]; ask [3]')).toEqual([
      { kind: 'text', text: 'Costs are listed.' },
      { kind: 'cite', n: 1 },
      { kind: 'text', text: ' Waivers exist;' },
      { kind: 'cite', n: 2 },
      { kind: 'text', text: ' ask' },
      { kind: 'cite', n: 3 },
    ]);
  });

  it('never produces markup from model text', () => {
    expect(parseInline('<img src=x onerror=alert(1)> [1]')).toEqual([
      { kind: 'text', text: '<img src=x onerror=alert(1)>' },
      { kind: 'cite', n: 1 },
    ]);
  });
});

describe('parseSummary', () => {
  const text = 'Start with "Scholarships" [1].\n\n- **Veterans:** see [2]\n- **International:** see [4]\n\nNext, apply [1].';
  const blocks = parseSummary(text);

  it('groups paragraphs and bullet lists', () => {
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'list', 'paragraph']);
    expect(blocks[1].kind === 'list' && blocks[1].items.length).toBe(2);
  });

  it('lists cited results once, in order of first citation', () => {
    expect(citedNumbers(blocks)).toEqual([1, 2, 4]);
  });

  it('treats headings as plain lines', () => {
    expect(parseSummary('## Overview\nText')[0]).toEqual({ kind: 'paragraph', runs: [{ kind: 'text', text: 'Overview Text' }] });
  });
});

describe('labelCitation', () => {
  it('links a lead bold label to the first citation in the item', () => {
    expect(labelCitation(parseInline('**For veterans:** Dedicated awards [2][4].'))).toBe(2);
  });

  it('is null without a lead label or without a citation', () => {
    expect(labelCitation(parseInline('Awards for veterans **only** [2].'))).toBeNull();
    expect(labelCitation(parseInline('**For veterans:** Dedicated awards.'))).toBeNull();
  });
});
