// src/features/tools/executors/data-source/lookup.match.test.ts

/**
 * The lookup's search fallback only returns a hit that is the record asked for,
 * never just the top hit for an id that doesn't exist.
 */

import { describe, it, expect, vi } from 'vitest';

const { getDocumentByIdFromIndex, searchById } = vi.hoisted(() => ({ getDocumentByIdFromIndex: vi.fn(), searchById: vi.fn() }));
vi.mock('@/features/search/search.service', () => ({ getDocumentByIdFromIndex, searchById }));
vi.mock('@/features/data-source/data-source.service', () => ({}));
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
    expect(matchesRequestedRecord('Jackets', 'x', { category: 'Jackets', name: 'Denim Jacket' })).toBe(false);
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
