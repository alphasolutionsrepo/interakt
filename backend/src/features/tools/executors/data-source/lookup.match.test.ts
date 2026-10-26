// src/features/tools/executors/data-source/lookup.match.test.ts

/**
 * The lookup's search fallback only returns a hit that is the record asked for,
 * never just the top hit for an id that doesn't exist.
 */

import { describe, it, expect, vi } from 'vitest';

const { getDocumentByIdFromIndex, searchById } = vi.hoisted(() => ({ getDocumentByIdFromIndex: vi.fn(), searchById: vi.fn() }));
vi.mock('@/features/search/search.service', () => ({ getDocumentByIdFromIndex, searchById }));
const { getDataSourceById } = vi.hoisted(() => ({ getDataSourceById: vi.fn(async () => ({ schema: null })) }));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceById }));
vi.mock('@/features/data-source/external-search/external-search.service', () => ({}));
vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  resolveDataSource: vi.fn(async () => ({ kind: 'managed', searchIndexId: 'idx' })),
}));

import catalog from '../../../../../setup/data/fashion_catalog.json';

import { executeDataSourceLookup, matchesRequestedRecord } from './lookup';

const products = catalog as Array<{ productId: string; name: string }>;

describe('matchesRequestedRecord', () => {
  it('matches the hit id', () => {
    expect(matchesRequestedRecord('abc-123', 'ABC-123', {})).toBe(true);
  });

  it('matches an identifier field exactly', () => {
    expect(matchesRequestedRecord('SKU 42', 'x', { sku: 'sku-42' })).toBe(true);
    expect(matchesRequestedRecord('42', 'x', { productCode: '420' })).toBe(false);
  });

  it('matches a name that contains every requested word', () => {
    expect(matchesRequestedRecord('Crew Neck Sweater', 'x', { title: 'Vesper & Co Crew Neck Sweater' })).toBe(true);
  });

  it('does not match a similar product with a different name', () => {
    expect(
      matchesRequestedRecord('Haven & Hart Denim Bomber', 'x', { name: 'Haven & Hart Streetwear Denim Jacket' }),
    ).toBe(false);
  });

  it('ignores fields that do not identify or name the record', () => {
    expect(matchesRequestedRecord('Outerwear', 'x', { category: 'Outerwear', name: 'Denim Jacket' })).toBe(false);
  });

  it('matches a request that names the record in a different order or with extra words', () => {
    const sweater = { name: 'Vesper & Co Casual Crew Neck Sweater', brand: 'Vesper & Co' };
    expect(matchesRequestedRecord('Casual Crew Neck Sweater by Vesper & Co', 'x', sweater)).toBe(true);
    expect(matchesRequestedRecord('Vesper & Co Casual Crew Neck Sweater in tan', 'x', sweater)).toBe(true);
  });

  it('treats plurals as the same word', () => {
    const sweater = { name: 'Vesper & Co Casual Crew Neck Sweater' };
    expect(matchesRequestedRecord('Vesper & Co Casual Crew Neck Sweaters', 'x', sweater)).toBe(true);
    expect(matchesRequestedRecord('Linen Dresses', 'x', { name: 'Linen Dress' })).toBe(true);
    expect(matchesRequestedRecord('Pastel Hoodie', 'x', { name: 'Pastel Hoodies' })).toBe(true);
    expect(matchesRequestedRecord('Silk Blouses', 'x', { name: 'Silk Blouse' })).toBe(true);
    expect(matchesRequestedRecord('Leather Watches', 'x', { name: 'Leather Watch' })).toBe(true);
  });

  it('matches a brand kept in its own field', () => {
    const sweater = { name: 'Crew Neck Sweater', brand: 'Vesper & Co' };
    expect(matchesRequestedRecord('Vesper & Co Crew Neck Sweater', 'x', sweater)).toBe(true);
    expect(matchesRequestedRecord('Vesper & Co Crew Neck Sweater', 'x', { name: 'Crew Neck Sweater', brand: 'Atlas Apparel' })).toBe(false);
  });

  it('does not match a short name that is only part of the request', () => {
    expect(matchesRequestedRecord('Vesper & Co Casual Crew Neck Sweater', 'x', { name: 'Sweater' })).toBe(false);
    expect(matchesRequestedRecord('Haven & Hart Denim Bomber', 'x', { name: 'Denim', brand: 'Haven & Hart' })).toBe(false);
  });

  it('matches the brand plus part of the title when the brand is in its own field', () => {
    const jacket = { name: 'Streetwear Denim Jacket', brand: 'Haven & Hart' };
    expect(matchesRequestedRecord('Haven & Hart Denim Jacket', 'x', jacket)).toBe(true);
    expect(matchesRequestedRecord('Haven & Hart Denim Jacket', 'x', { ...jacket, brand: 'Atlas Apparel' })).toBe(false);
  });

  it('counts only name fields as the name, not fields that merely end in "name"', () => {
    expect(matchesRequestedRecord('Navy', 'x', { name: 'Crew Neck Sweater', colorName: 'Navy' })).toBe(false);
    expect(matchesRequestedRecord('Crew Neck Sweater', 'x', { label: 'Crew Neck Sweater' })).toBe(true);
    expect(matchesRequestedRecord('Crew Neck Sweater', 'x', { product_name: 'Crew Neck Sweater' })).toBe(true);
    expect(matchesRequestedRecord('Crew Neck Sweater', 'x', { headline: 'Crew Neck Sweater' })).toBe(false);
    expect(matchesRequestedRecord('Crew Neck Sweater', 'x', { headline: 'Crew Neck Sweater' }, { titleFields: ['headline'] })).toBe(true);
  });

  it('uses fields ending in name or title when a record has no known name field', () => {
    expect(matchesRequestedRecord('Fancy Stay', 'h1', { HotelId: 'h1', HotelName: 'Fancy Stay' })).toBe(true);
    expect(matchesRequestedRecord('Navy', 'x', { name: 'Crew Neck Sweater', colorName: 'Navy' })).toBe(false);
    expect(matchesRequestedRecord('Acme', 'x', { HotelName: 'Fancy Stay', brandName: 'Acme' })).toBe(false);
  });

  it('matches a code held in any field, or in a list, by its whole value', () => {
    expect(matchesRequestedRecord('978-0134494166', 'b1', { title: 'Clean Architecture', isbn: '978-0134494166' })).toBe(true);
    expect(matchesRequestedRecord('HB-2231', 'x', { name: 'Hand Blender', partNo: 'HB-2231' })).toBe(true);
    expect(matchesRequestedRecord('SKU-2', 'x', { name: 'Desk Lamp', variants: [{ sku: 'SKU-1' }, { sku: 'SKU-2' }] })).toBe(true);
    expect(matchesRequestedRecord('X100', 'x', { name: 'Camera', models: ['X100', 'X200'] })).toBe(true);
  });

  it('does not take a plain word from another field, or part of a code, as the item', () => {
    expect(matchesRequestedRecord('Black', 'x', { name: 'Desk Lamp', color: 'Black' })).toBe(false);
    expect(matchesRequestedRecord('2231', 'x', { name: 'Hand Blender', partNo: 'HB-2231' })).toBe(false);
    expect(matchesRequestedRecord('SKU-3', 'x', { name: 'Desk Lamp', variants: [{ sku: 'SKU-1' }] })).toBe(false);
  });

  it('ignores filler words on both sides', () => {
    expect(matchesRequestedRecord('the crew neck sweater', 'x', { name: 'Vesper & Co Crew Neck Sweater' })).toBe(true);
    expect(matchesRequestedRecord('The Lord of the Rings', 'x', { title: 'Lord of the Rings' })).toBe(true);
    expect(matchesRequestedRecord('the sweater by Vesper & Co for the winter season', 'x', { name: 'Sweater' })).toBe(false);
  });

  it('does not take the brand alone as the item', () => {
    const sweater = { name: 'Vesper & Co Casual Crew Neck Sweater', brand: 'Vesper & Co' };
    expect(matchesRequestedRecord('Vesper & Co', 'x', sweater)).toBe(false);
  });

  it('ignores fields about a related item', () => {
    expect(matchesRequestedRecord('Nike', 'x', { brandName: 'Nike', name: 'Air Runner' })).toBe(false);
    expect(matchesRequestedRecord('12', 'x', { categoryId: '12', name: 'Air Runner' })).toBe(false);
  });
});

describe('managed lookup fallback', () => {
  it('returns the hit that matches, not the top hit', async () => {
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({
      hits: [
        { id: 'p1', source: { name: 'Streetwear Denim Jacket' } },
        { id: 'p2', source: { name: 'Vesper & Co Crew Neck Sweater' } },
      ],
    });

    const result = await executeDataSourceLookup('ds', {}, { id: 'Vesper & Co Crew Neck Sweater' });

    expect(result).toEqual({
      success: true,
      data: { id: 'p2', document: { name: 'Vesper & Co Crew Neck Sweater' }, matchedBy: 'search_fallback' },
    });
    // Looking past the top hit needs more than one candidate from the engine
    expect(searchById).toHaveBeenCalledWith(
      'idx',
      { query: 'Vesper & Co Crew Neck Sweater', pageSize: 5 },
      { triggerType: 'ai_tool' },
    );
  });

  it('lets a failed fallback search throw, not answer not found (executeTool retries and labels it)', async () => {
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockRejectedValueOnce(new Error('search_phase_execution_exception'));

    await expect(executeDataSourceLookup('ds', {}, { id: 'Vesper & Co Crew Neck Sweater' }))
      .rejects.toThrow('search_phase_execution_exception');
  });

  it("matches on the field the data source's schema calls the title", async () => {
    getDataSourceById.mockResolvedValueOnce({
      schema: { fields: [{ name: 'headline', type: 'text', role: 'title' }] },
    } as never);
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({ hits: [{ id: 'p1', source: { headline: 'Crew Neck Sweater' } }] });

    const result = await executeDataSourceLookup('ds', {}, { id: 'Crew Neck Sweater' });

    expect(result).toMatchObject({ success: true, data: { id: 'p1', matchedBy: 'search_fallback' } });
  });

  it("treats the schema's title field as the name, even one called storeName", async () => {
    getDataSourceById.mockResolvedValueOnce({
      schema: { fields: [{ name: 'storeId', type: 'keyword', role: 'id' }, { name: 'storeName', type: 'text', role: 'title' }] },
    } as never);
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({
      hits: [{ id: 's1', source: { storeId: 's1', storeName: 'Downtown Flagship', managerName: 'Ana Ruiz' } }],
    });

    const result = await executeDataSourceLookup('ds', {}, { id: 'Downtown Flagship' });

    expect(result).toMatchObject({ success: true, data: { id: 's1', matchedBy: 'search_fallback' } });
  });

  it('uses a name field like storeName when the record has no other name, without a schema', async () => {
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({ hits: [{ id: 's1', source: { storeName: 'Downtown Flagship', city: 'Austin' } }] });

    const result = await executeDataSourceLookup('ds', {}, { id: 'Downtown Flagship' });

    expect(result).toMatchObject({ success: true, data: { id: 's1' } });
  });

  it('does not return an item that only mentions the code, over the item that has it in its name', async () => {
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({
      hits: [
        { id: 'phone', source: { name: 'Apple iPhone 15 128GB' } },
        { id: 'case', source: { name: 'Clear Case', compatibleWith: 'iPhone 15' } },
      ],
    });

    const result = await executeDataSourceLookup('ds', {}, { id: 'iPhone 15' });

    expect(result.data).toMatchObject({
      found: false,
      matches: [{ id: 'phone', name: 'Apple iPhone 15 128GB' }, { id: 'case', name: 'Clear Case' }],
    });
  });

  it('still finds the item whose identifier field holds the code, over one that mentions it', async () => {
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({
      hits: [
        { id: 'case', source: { name: 'Clear Case', compatibleWith: 'HB-2231' } },
        { id: 'blender', source: { name: 'Hand Blender', sku: 'HB-2231' } },
      ],
    });

    const result = await executeDataSourceLookup('ds', {}, { id: 'HB-2231' });

    expect(result).toMatchObject({ success: true, data: { id: 'blender' } });
  });

  it('does not take a plain number from another field as the item', async () => {
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({ hits: [{ id: 'p88', source: { name: 'Tote Bag', reviewCount: 245, price: 19.99 } }] });

    const result = await executeDataSourceLookup('ds', {}, { id: '245' });

    expect(result.data).toMatchObject({ found: false });
  });

  it('returns the hit a reworded request names', async () => {
    const sweater = { name: 'Vesper & Co Casual Crew Neck Sweater', brand: 'Vesper & Co' };
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({
      hits: [
        { id: 'p1', source: { name: 'Atlas Apparel Athleisure Crew Neck Sweater', brand: 'Atlas Apparel' } },
        { id: 'p2', source: sweater },
      ],
    });

    const result = await executeDataSourceLookup('ds', {}, { id: 'Vesper & Co Casual Crew Neck Sweaters in tan' });

    expect(result).toEqual({ success: true, data: { id: 'p2', document: sweater, matchedBy: 'search_fallback' } });
  });

  it('returns not found, with no document, when no hit matches', async () => {
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({ hits: [{ id: 'p1', source: { name: 'Streetwear Denim Jacket' } }] });

    const result = await executeDataSourceLookup('ds', {}, { id: 'Haven & Hart Denim Bomber' });

    expect(result).toEqual({
      success: true,
      data: {
        found: false,
        requested: 'Haven & Hart Denim Bomber',
        message: 'No record matches "Haven & Hart Denim Bomber". closestMatches lists the nearest items found;'
          + ' none of them is the item asked for.',
        closestMatches: [{ id: 'p1', name: 'Streetwear Denim Jacket' }],
      },
    });
  });

  it('leaves out hits that share only the brand or a filler word with the request', async () => {
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({
      hits: [
        { id: 'p1', source: { name: 'Haven & Hart Flowing Maxi Dress', brand: 'Haven & Hart' } },
        { id: 'p2', source: { name: 'Card for Mom' } },
        { id: 'p3', source: { name: 'Haven & Hart Streetwear Denim Jacket', brand: 'Haven & Hart' } },
      ],
    });

    const result = await executeDataSourceLookup('ds', {}, { id: 'Haven & Hart Denim Bomber for Dad' });

    expect((result.data as { closestMatches: unknown[] }).closestMatches).toEqual([
      { id: 'p3', name: 'Haven & Hart Streetwear Denim Jacket' },
    ]);
  });

  it('answers plain not found when no hit shares a word with the request', async () => {
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({ hits: [{ id: 'p1', source: { name: 'Streetwear Denim Jacket' } }] });

    const result = await executeDataSourceLookup('ds', {}, { id: 'XYZ-999' });

    expect(result).toEqual({
      success: true,
      data: { found: false, requested: 'XYZ-999', message: 'No record matches "XYZ-999".' },
    });
  });

  it('offers at most three closest matches, by id and name only', async () => {
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({
      hits: ['A', 'B', 'C', 'D'].map((x) => ({ id: x, source: { name: `Denim Jacket ${x}`, price: 10, brand: 'Acme' } })),
    });

    const result = await executeDataSourceLookup('ds', {}, { id: 'Haven & Hart Denim Bomber' });

    expect((result.data as { closestMatches: unknown[] }).closestMatches).toEqual([
      { id: 'A', name: 'Denim Jacket A' },
      { id: 'B', name: 'Denim Jacket B' },
      { id: 'C', name: 'Denim Jacket C' },
    ]);
  });

  it('says several match, with the list, when more than one item fits', async () => {
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({
      hits: [
        { id: 'p1', source: { name: 'Vesper & Co Casual Crew Neck Sweater', brand: 'Vesper & Co' } },
        { id: 'p2', source: { name: 'Echo Style Minimalist Crew Neck Sweater', brand: 'Echo Style' } },
        { id: 'p3', source: { name: 'Indigo Park Casual V-Neck Sweater', brand: 'Indigo Park' } },
        { id: 'p4', source: { name: 'Atlas Apparel Athleisure Crew Neck Sweater', brand: 'Atlas Apparel' } },
      ],
    });

    const result = await executeDataSourceLookup('ds', {}, { id: 'Crew Neck Sweater' });

    expect(result).toEqual({
      success: true,
      data: {
        found: false,
        requested: 'Crew Neck Sweater',
        message: 'Several records match "Crew Neck Sweater". matches lists them; ask the user which one they mean.',
        matches: [
          { id: 'p1', name: 'Vesper & Co Casual Crew Neck Sweater' },
          { id: 'p2', name: 'Echo Style Minimalist Crew Neck Sweater' },
          { id: 'p4', name: 'Atlas Apparel Athleisure Crew Neck Sweater' },
        ],
      },
    });
  });

  it('says several match when two records share the exact name', async () => {
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({
      hits: [
        { id: 'p1', source: { name: 'Atlas Apparel Formal V-Neck Sweater', material: 'wool' } },
        { id: 'p2', source: { name: 'Atlas Apparel Formal V-Neck Sweater', material: 'cashmere' } },
        { id: 'p3', source: { name: 'Atlas Apparel Formal V-Neck Sweater Vest' } },
      ],
    });

    const result = await executeDataSourceLookup('ds', {}, { id: 'Atlas Apparel Formal V-Neck Sweater' });

    expect((result.data as { matches: unknown[] }).matches).toEqual([
      { id: 'p1', name: 'Atlas Apparel Formal V-Neck Sweater' },
      { id: 'p2', name: 'Atlas Apparel Formal V-Neck Sweater' },
    ]);
  });

  it('returns the exact match when longer names also fit', async () => {
    const exact = { name: 'Crew Neck Sweater' };
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({
      hits: [
        { id: 'p1', source: { name: 'Crew Neck Sweater Deluxe' } },
        { id: 'p2', source: exact },
      ],
    });

    const result = await executeDataSourceLookup('ds', {}, { id: 'crew neck sweater' });

    expect(result).toEqual({ success: true, data: { id: 'p2', document: exact, matchedBy: 'search_fallback' } });
  });

  it('finds a document by its title with an extra word', async () => {
    const guide = { title: 'Quarterly Planning Guide' };
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({ hits: [{ id: 'doc-7', source: guide }] });

    const result = await executeDataSourceLookup('ds', {}, { id: 'Quarterly Planning Guide 2024' });

    expect(result).toEqual({ success: true, data: { id: 'doc-7', document: guide, matchedBy: 'search_fallback' } });
  });

  it('offers a record whose title shares a word when a code comes with an extra word', async () => {
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({ hits: [{ id: 'INV-2041', source: { title: 'Invoice Template' } }] });

    const result = await executeDataSourceLookup('ds', {}, { id: 'INV-2041 template' });

    expect(result.data).toMatchObject({ found: false, closestMatches: [{ id: 'INV-2041', name: 'Invoice Template' }] });
  });

  it('finds every demo product by its full name, or says several match when names are shared', async () => {
    const hits = products.map((p) => ({ id: p.productId, source: p as unknown as Record<string, unknown> }));
    const wrong: string[] = [];
    for (const product of products) {
      getDocumentByIdFromIndex.mockResolvedValueOnce(null);
      searchById.mockResolvedValueOnce({ hits });
      const data = (await executeDataSourceLookup('ds', {}, { id: product.name })).data as {
        id?: string; matches?: Array<{ id: string; name: string }>;
      };
      const ok = data.id === product.productId
        || (data.matches?.some((m) => m.id === product.productId) && data.matches.every((m) => m.name === product.name));
      if (!ok) wrong.push(`${product.name} -> ${JSON.stringify(data).slice(0, 120)}`);
    }
    expect(wrong).toEqual([]);
  });

  it('answers plain not found when the search finds nothing', async () => {
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({ hits: [] });

    const result = await executeDataSourceLookup('ds', {}, { id: 'XYZ-999' });

    expect(result).toEqual({
      success: true,
      data: { found: false, requested: 'XYZ-999', message: 'No record matches "XYZ-999".' },
    });
  });
});

describe('with field roles from the data source', () => {
  const withSchema = (fields: Array<{ name: string; role: string }>, rolesConfirmed?: boolean) =>
    getDataSourceById.mockResolvedValueOnce({
      schema: { fields: fields.map((f) => ({ ...f, type: 'text' })), ...(rolesConfirmed !== undefined && { rolesConfirmed }) },
    } as never);

  it('reads several title fields as one name', async () => {
    withSchema([{ name: 'author', role: 'title' }, { name: 'title', role: 'title' }]);
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({
      hits: [{ id: 'b1', source: { author: 'Robert Martin', title: "Clean Architecture: A Craftsman's Guide" } }],
    });

    const result = await executeDataSourceLookup('ds', {}, { id: 'Martin Clean Architecture' });

    expect(result).toMatchObject({ success: true, data: { id: 'b1' } });
  });

  it('takes a value in a declared id field as certain, over a record that only mentions it', async () => {
    withSchema([{ name: 'name', role: 'title' }, { name: 'partNo', role: 'id' }]);
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({
      hits: [
        { id: 'jar', source: { name: 'Blender Jar', compatibleWith: 'HB-2231' } },
        { id: 'blender', source: { name: 'Hand Blender', partNo: 'HB-2231' } },
      ],
    });

    const result = await executeDataSourceLookup('ds', {}, { id: 'HB-2231' });

    expect(result).toMatchObject({ success: true, data: { id: 'blender' } });
  });

  it('finds a code in a declared id field inside a list', async () => {
    withSchema([{ name: 'name', role: 'title' }, { name: 'variants.sku', role: 'id' }], true);
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({ hits: [{ id: 'lamp', source: { name: 'Desk Lamp', variants: [{ sku: 'LMP-1' }, { sku: 'LMP-2' }] } }] });

    const result = await executeDataSourceLookup('ds', {}, { id: 'LMP-2' });

    expect(result).toMatchObject({ success: true, data: { id: 'lamp' } });
  });

  it('uses only the declared fields once roles are confirmed', async () => {
    const lamp = { id: 'lamp', source: { name: 'Desk Lamp', compatibleWith: 'LMP-1' } };
    withSchema([{ name: 'label', role: 'title' }], true);
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({ hits: [lamp] });
    withSchema([{ name: 'label', role: 'title' }], true);
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({ hits: [lamp] });

    const byName = await executeDataSourceLookup('ds', {}, { id: 'Desk Lamp' });
    const byMention = await executeDataSourceLookup('ds', {}, { id: 'LMP-1' });

    expect(byName.data).toMatchObject({ found: false });
    expect(byMention.data).toMatchObject({ found: false });
  });

  it('still falls back to guessing fields while roles are not confirmed', async () => {
    withSchema([{ name: 'label', role: 'title' }]);
    getDocumentByIdFromIndex.mockResolvedValueOnce(null);
    searchById.mockResolvedValueOnce({ hits: [{ id: 'lamp', source: { name: 'Desk Lamp' } }] });

    const result = await executeDataSourceLookup('ds', {}, { id: 'Desk Lamp' });

    expect(result).toMatchObject({ success: true, data: { id: 'lamp' } });
  });
});
