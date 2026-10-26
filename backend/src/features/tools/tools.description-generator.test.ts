// src/features/tools/tools.description-generator.test.ts

/**
 * Find Record tools say what they accept: a search-index lookup takes an id, a SKU or a name
 * (it falls back to a matching search); a file-store lookup takes a chunk id only.
 */

import { describe, it, expect } from 'vitest';

import { generateToolDescription } from './tools.description-generator';
import { lookupFindsByName } from './tools.registry';

function idDescription(schema: Record<string, unknown>): unknown {
  return (schema.properties as Record<string, { description?: string }>).id?.description;
}

describe('Find Record descriptions', () => {
  it('describes a managed index lookup as taking an id, SKU or name', () => {
    const { aiDescription, inputSchema } = generateToolDescription('Fashion Catalog', 'search_index', 'lookup');

    expect(aiDescription).toBe(
      'Look up one specific item in "Fashion Catalog" by its ID, SKU or full name. '
      + 'Use this when the user asks about that item, not similar ones. When several items fit, returns found: false with matches; ask the user which one. When none fits, returns found: false with closestMatches.',
    );
    expect(idDescription(inputSchema)).toBe("The item's ID, SKU or full name, as the user gave it");
  });

  it('describes an external index lookup the same way', () => {
    const { aiDescription, inputSchema } = generateToolDescription('Shop', 'search_index_external', 'lookup');

    expect(aiDescription).toContain('in the external "Shop" index by its ID, SKU or full name');
    expect(aiDescription).toContain('When several items fit, returns found: false with matches; ask the user which one.');
    expect(idDescription(inputSchema)).toBe("The item's ID, SKU or full name, as the user gave it");
  });

  it('keeps a file-store lookup to ids', () => {
    const { aiDescription, inputSchema } = generateToolDescription('Docs', 'file_store', 'lookup');

    expect(aiDescription).toBe('Look up a specific document or chunk by ID from "Docs".');
    expect(idDescription(inputSchema)).toBe('The unique identifier of the document to retrieve');
  });

  it('knows which lookups find items by name', () => {
    expect(lookupFindsByName('search_index')).toBe(true);
    expect(lookupFindsByName('search_index_external')).toBe(true);
    expect(lookupFindsByName('file_store')).toBe(false);
    expect(lookupFindsByName('unknown')).toBe(false);
  });
});
