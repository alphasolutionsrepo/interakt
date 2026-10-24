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

import { executeDataSourceLookup, matchesRequestedRecord } from './lookup';

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
    expect(matchesRequestedRecord('Crew Neck Sweater', 'x', { headline: 'Crew Neck Sweater' }, ['headline'])).toBe(true);
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

    const result = await executeDataSourceLookup('ds', {}, { id: 'XYZ-999' });

    expect(result).toEqual({
      success: true,
      data: { found: false, requested: 'XYZ-999', message: 'No record matches "XYZ-999".' },
    });
  });
});
