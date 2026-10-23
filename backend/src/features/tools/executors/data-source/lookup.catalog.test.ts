// src/features/tools/executors/data-source/lookup.catalog.test.ts

/**
 * Find Record's matching, checked against every product in the demo catalog: each
 * product is found when asked for the way people and the planner phrase it, and no
 * request ever matches a product with a different name. A live search only shows the
 * first; ranking hides the second, so it is checked here against the whole catalog.
 */

import { describe, it, expect } from 'vitest';

import catalog from '../../../../../setup/data/fashion_catalog.json';

import { matchesRequestedRecord } from './lookup';

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

function matchingNames(request: string): string[] {
  return [...new Set(products.filter((p) => matchesRequestedRecord(request, p.productId, p)).map((p) => p.name))];
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
  });

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
