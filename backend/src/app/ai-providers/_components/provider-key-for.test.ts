// src/app/ai-providers/_components/provider-key-for.test.ts

/** The provider form makes a key from the name an admin types, in the shape keys must have. */

import { describe, expect, it } from 'vitest';

import { providerKeyFor } from './ProviderFormDialog';

describe('providerKeyFor', () => {
  it.each([
    ['Campus AI', 'campus-ai'],
    ['  Research   Cluster (GPU) ', 'research-cluster-gpu'],
    ['2nd Gateway', 'nd-gateway'],
    ['Café Models', 'cafe-models'],
  ])('makes %j into %j', (name, key) => {
    expect(providerKeyFor(name)).toBe(key);
  });

  it('always fits the key rule', () => {
    for (const name of ['Campus AI', '2nd Gateway', '!!!', 'x'.repeat(80)]) {
      const key = providerKeyFor(name);
      expect(key === '' || /^[a-z][a-z0-9_-]*$/.test(key)).toBe(true);
      expect(key.length).toBeLessThanOrEqual(50);
    }
  });
});
