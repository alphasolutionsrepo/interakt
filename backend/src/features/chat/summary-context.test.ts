// src/features/chat/summary-context.test.ts

import { describe, it, expect } from 'vitest';

import { queryTerms, selectFieldPassages, selectPassages } from './summary-context';

const PAGE = [
  '# Computer science',
  'College: College of Engineering. Duration: 4 years, 120 credits. Locations: Moscow, Coeur d\'Alene.',
  '## Inside the minds of our students',
  'Hear from students about campus life, clubs and the Vandal experience in Moscow every week.',
  '## Visit campus',
  'Schedule a tour, meet an admissions counselor and see the residence halls before you apply here.',
  '## Specializations',
  'Tailor the computer science degree: algorithms and data, networking, cybersecurity, graphics and gaming.',
  '## Capstone',
  'Every computer science student completes a two-semester senior capstone project with an industry sponsor.',
].join('\n');

describe('queryTerms', () => {
  it('drops stop words and folds plurals', () => {
    expect(queryTerms('How do I get computer science degrees?')).toEqual(['computer', 'science', 'degree']);
  });

  it('keeps Danish and Norwegian words whole', () => {
    expect(queryTerms('Hvor kan jeg købe smørrebrød på Nørrebro?')).toEqual(
      expect.arrayContaining(['smørrebrød', 'nørrebro']),
    );
    expect(queryTerms('Hvordan søker jeg etter blåbærsyltetøy på nettbutikken?')).toEqual(
      expect.arrayContaining(['søker', 'nettbutikken', 'blåbærsyltetøy']),
    );
  });

  it('gives the same terms as before for English', () => {
    expect(queryTerms('How do I stop my assistant answering off-topic questions in 2026?')).toEqual([
      'stop', 'assistant', 'answering', 'off', 'topic', 'question', '2026',
    ]);
  });
});

describe('selectPassages', () => {
  it('returns text within the budget unchanged', () => {
    expect(selectPassages('Short page.', 'anything', 500)).toBe('Short page.');
  });

  it('keeps the opening and the query-matching sections, skipping boilerplate', () => {
    const out = selectPassages(PAGE, 'computer science specializations', 520);
    expect(out).toContain('120 credits');
    expect(out).toContain('algorithms and data, networking, cybersecurity');
    expect(out).toContain('## Specializations');
    expect(out).not.toContain('residence halls');
    expect(out.length).toBeLessThanOrEqual(520 + 10);
  });

  it('keeps page order and marks skipped text', () => {
    const out = selectPassages(PAGE, 'capstone specializations', 520);
    expect(out.indexOf('Specializations')).toBeLessThan(out.indexOf('Capstone'));
    expect(out).toContain('…');
  });

  it('reads on from the top when nothing matches the query', () => {
    const out = selectPassages(PAGE, 'zzz', 300);
    expect(out.startsWith('# Computer science')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(310);
  });

  it('cuts a single over-long opening at a word boundary', () => {
    const out = selectPassages('word '.repeat(200).trim(), 'zzz', 100);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(101);
  });
});

describe('selectFieldPassages', () => {
  it('only reduces string fields longer than the budget', () => {
    const out = selectFieldPassages({ title: 'Computer science', credits: 120, body: PAGE }, 'capstone', 400);
    expect(out.title).toBe('Computer science');
    expect(out.credits).toBe(120);
    expect(String(out.body)).toContain('senior capstone');
  });
});

describe('selectPassages with Danish text', () => {
  it('reaches the passage that holds the whole query word, far down a long text', () => {
    const filler = Array.from({ length: 30 }, (_, i) => `Fakturering og regning nummer ${i} sendes til kunden hver måned.`);
    const text = [
      '# Produkter',
      'Lager i Aarhus, levering på fire dage, 240 varer.',
      ...filler,
      '## Køkken',
      'Søgning efter støbejernsgryden giver tre farver på lager.',
    ].join('\n');

    const out = selectPassages(text, 'søgning', 1000);
    expect(text.length).toBeGreaterThan(1000);
    expect(out).toContain('støbejernsgryden');
  });
});
