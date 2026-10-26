// src/features/tools/executors/data-source/lookup.catalog.test.ts

/**
 * Find Record's matching, checked against every product in the demo catalog: each
 * product is found when asked for the way people and the planner phrase it, and no
 * request ever matches a product with a different name. A live search only shows the
 * first; ranking hides the second, so it is checked here against the whole catalog.
 */

import { describe, it, expect, vi } from 'vitest';

// The production path (executeDataSourceLookup) on a managed index whose key fetch misses, so
// the record is chosen from the search hits each test hands it
const { searchById } = vi.hoisted(() => ({ searchById: vi.fn() }));
vi.mock('@/features/search/search.service', () => ({ getDocumentByIdFromIndex: vi.fn(async () => null), searchById }));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceById: vi.fn(async () => ({ schema: null })) }));
vi.mock('@/features/data-source/external-search/external-search.service', () => ({}));
vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  resolveDataSource: vi.fn(async () => ({ kind: 'managed', searchIndexId: 'idx' })),
}));

import catalog from '../../../../../setup/data/fashion_catalog.json';

import { executeDataSourceLookup, matchesRequestedRecord } from './lookup';

interface Product extends Record<string, unknown> {
  productId: string;
  name: string;
  brand: string;
}

const products = catalog as Product[];

function plural(name: string): string {
  if (/(ss|x|ch|sh)$/.test(name)) return `${name}es`;
  return name.endsWith('s') ? name : `${name}s`;
}

/** The ways a product gets asked for: by people in chat, and by the planner copying them. */
function phrasings(product: Product): Record<string, string> {
  const { name, brand, productId } = product;
  const withoutBrand = name.startsWith(brand) ? name.slice(brand.length).trim() : name;
  return {
    'exact name': name,
    'brand last': `${withoutBrand} by ${brand}`,
    'extra words': `${name} in tan`,
    'leading article': `the ${name}`,
    'lower case': name.toLowerCase(),
    'in quotes': `"${name}"`,
    'and for &': name.replace('&', 'and'),
    'hyphen as space': name.replace(/-/g, ' '),
    plural: plural(name),
    'id lower case': productId.toLowerCase(),
    'id with a space': productId.replace('-', ' '),
  };
}

const matched = new Map<string, Product[]>();
/** Every catalog product the matching rules accept for a request (kept, as tests ask again). */
function matchingProducts(request: string): Product[] {
  if (!matched.has(request)) matched.set(request, products.filter((p) => matchesRequestedRecord(request, p.productId, p)));
  return matched.get(request)!;
}

function matchingNames(request: string): string[] {
  return [...new Set(matchingProducts(request).map((p) => p.name))];
}

describe('Find Record matching on the demo catalog', () => {
  it('has the catalog to check', () => {
    expect(products.length).toBeGreaterThanOrEqual(200);
  });

  it('finds every product however it is phrased', () => {
    const missed = products.flatMap((product) =>
      Object.entries(phrasings(product))
        .filter(([, request]) => !matchesRequestedRecord(request, product.productId, product))
        .map(([kind, request]) => `${kind}: ${request}`),
    );
    expect(missed).toEqual([]);
  });

  it('never matches a product with a different name', () => {
    const wrong = products.flatMap((product) =>
      Object.entries(phrasings(product)).flatMap(([kind, request]) =>
        matchingNames(request)
          .filter((name) => name !== product.name)
          .map((name) => `${kind}: "${request}" matched "${name}"`),
      ),
    );
    expect(wrong).toEqual([]);
  }, 30_000); // every phrasing of every product against the whole catalog: ~440k checks

  it('returns the product, or asks which one when products share its name, through the production path', async () => {
    const wrong: string[] = [];
    for (const product of products) {
      for (const [kind, request] of Object.entries(phrasings(product))) {
        // The worst search: the product plus the other products the rules accept, top 5
        const others = matchingProducts(request).filter((p) => p !== product).slice(0, 4);
        searchById.mockResolvedValueOnce({ hits: [product, ...others].map((p) => ({ id: p.productId, source: p })) });
        const { data } = (await executeDataSourceLookup('ds', {}, { id: request })) as {
          data: { id?: string; matches?: Array<{ id: string; name?: string }> };
        };
        const fine = data.id === product.productId
          || (data.matches?.some((m) => m.id === product.productId) && data.matches.every((m) => m.name === product.name));
        if (!fine) wrong.push(`${kind}: "${request}" -> ${JSON.stringify(data).slice(0, 120)}`);
      }
    }
    expect(wrong).toEqual([]);
  }, 30_000);

  it('finds nothing for a product type the brand does not make', () => {
    const wrong = products.flatMap((product) => {
      const request = `${product.brand} Denim Bomber`;
      return matchingNames(request).map((name) => `"${request}" matched "${name}"`);
    });
    expect(wrong).toEqual([]);
  });

  it('finds nothing for a known product with its type swapped', () => {
    const wrong = products.flatMap((product) => {
      // A type the name doesn't already have: "Modern Bomber Jacket" -> "Modern Bomber Bomber"
      // would just be a fair way to ask for the jacket.
      const swapped = /bomber/i.test(product.name) ? 'Sandals' : 'Bomber';
      const request = product.name.replace(/\S+$/, swapped);
      return matchingNames(request).map((name) => `"${request}" matched "${name}"`);
    });
    expect(wrong).toEqual([]);
  });
});
