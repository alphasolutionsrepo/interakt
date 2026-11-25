// src/features/chat/summary-context.test.ts

import { describe, it, expect } from 'vitest';

import { queryTerms, selectFieldPassages, selectPassages } from './summary-context';

const PAGE = [
  '# Cast iron cookware',
  'Range: Kitchen essentials. Warranty: 4 years, 120 pieces in stock. Warehouses: North, South.',
  '## Inside our test kitchen',
  'Hear from cooks about recipes, clubs and the tasting evenings in our test kitchen every week.',
  '## Visit the showroom',
  'Schedule a tour, meet a product advisor and see the display kitchens before you order here.',
  '## Finishes',
  'Tailor the cast iron cookware: enamel and matte, pre-seasoned, black, red, blue and sage.',
  '## Seasoning',
  'Every cast iron pot ships with a two-step seasoning guide written by our test kitchen team.',
].join('\n');

describe('queryTerms', () => {
  it('drops stop words and folds plurals', () => {
    expect(queryTerms('How do I find cast iron skillets?')).toEqual(['find', 'cast', 'iron', 'skillet']);
  });

  it('keeps Danish and Norwegian words whole', () => {
    expect(queryTerms('Hvor kan jeg købe smørrebrød på Nørrebro?')).toEqual(
      expect.arrayContaining(['smørrebrød', 'nørrebro']),
    );
    expect(queryTerms('Hvordan søker jeg etter blåbærsyltetøy på nettbutikken?')).toEqual(
      expect.arrayContaining(['søker', 'nettbutikken', 'blåbærsyltetøy']),
    );
  });

  it('keeps a word whole when its accent is typed as a separate mark', () => {
    expect(queryTerms('Prüfung der Bücher'.normalize('NFD'))).toEqual(expect.arrayContaining(['prüfung', 'bücher']));
  });

  it('folds a trailing s on a kept non-ASCII word the same way as on an English one', () => {
    // "smørrebrøds" (genitive) folds to "smørrebrød", which still matches the word in the text
    expect(queryTerms('smørrebrøds pris')).toEqual(['smørrebrød', 'pris']);
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
    const out = selectPassages(PAGE, 'cast iron finishes', 520);
    expect(out).toContain('120 pieces');
    expect(out).toContain('enamel and matte, pre-seasoned');
    expect(out).toContain('## Finishes');
    expect(out).not.toContain('display kitchens');
    expect(out.length).toBeLessThanOrEqual(520 + 10);
  });

  it('keeps page order and marks skipped text', () => {
    const out = selectPassages(PAGE, 'seasoning finishes', 520);
    expect(out.indexOf('## Finishes')).toBeLessThan(out.indexOf('## Seasoning'));
    expect(out).toContain('…');
  });

  it('reads on from the top when nothing matches the query', () => {
    const out = selectPassages(PAGE, 'zzz', 300);
    expect(out.startsWith('# Cast iron cookware')).toBe(true);
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
    const out = selectFieldPassages({ title: 'Cast iron cookware', pieces: 120, body: PAGE }, 'seasoning', 400);
    expect(out.title).toBe('Cast iron cookware');
    expect(out.pieces).toBe(120);
    expect(String(out.body)).toContain('two-step seasoning guide');
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

describe('selectPassages with decomposed accents', () => {
  it('matches a query word against text whose accents are stored as separate marks', () => {
    const filler = Array.from({ length: 30 }, (_, i) => `Lieferung Nummer ${i} geht jeden Monat an den Kunden.`);
    const text = [
      '# Produkte',
      ...filler,
      '## Küche',
      'Gusseisentöpfe in drei Farben auf Lager.'.normalize('NFD'),
    ].join('\n');

    const out = selectPassages(text, 'gusseisentöpfe', 1000);
    expect(out.normalize('NFC')).toContain('Gusseisentöpfe');
  });
});

describe('selectPassages ranking', () => {
  it('ranks a passage holding the long query word above many holding only a short one', () => {
    // "af" is a common Danish word that also sits inside "Afsnit"; it must not crowd out the subject
    const filler = Array.from({ length: 40 }, (_, i) => `## Afsnit ${i}\nFakturering og regning nummer ${i} sendes til kunden hver måned med posten.`);
    const page = [
      '# Køkkenudstyr', 'Lager i Aarhus, levering på fire dage.', ...filler,
      '## Pleje af støbejern', 'Støbejernsgryden skal vaskes i hånden og tørres straks, ellers ruster den.', ...filler,
    ].join('\n');
    const out = selectPassages(page, 'pleje af støbejern', 600);
    expect(out).toContain('Støbejernsgryden skal vaskes');
    expect(out).toContain('## Pleje af støbejern');
  });
});
