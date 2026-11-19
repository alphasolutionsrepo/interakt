import { describe, expect, it } from 'vitest';

import { createSearchIndexSchema } from './search-index.validation';

const valid = { name: 'products', displayName: 'Products', searchType: 'lexical' as const };

describe('createSearchIndexSchema', () => {
  it('keeps provider settings of any shape and fills in the defaults', () => {
    const settings = { shards: 3, nested: { a: [1, 2] }, flag: true };
    const result = createSearchIndexSchema.safeParse({ ...valid, providerSettings: settings });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.providerSettings).toEqual(settings);
    expect(result.data.numberOfShards).toBe(1);
    expect(result.data.numberOfReplicas).toBe(0);
    expect(result.data.refreshInterval).toBe('1s');
  });

  it('defaults omitted provider settings to an empty object', () => {
    const result = createSearchIndexSchema.safeParse(valid);
    expect(result.success && result.data.providerSettings).toEqual({});
  });

  it('keeps the values it is given', () => {
    const result = createSearchIndexSchema.safeParse({ ...valid, numberOfShards: 5, numberOfReplicas: 2, refreshInterval: '30s' });
    expect(result.success && [result.data.numberOfShards, result.data.numberOfReplicas, result.data.refreshInterval]).toEqual([5, 2, '30s']);
  });

  it('refuses provider settings that are not an object', () => {
    for (const providerSettings of ['x', 5, [1]]) {
      const result = createSearchIndexSchema.safeParse({ ...valid, providerSettings });
      expect(result.success).toBe(false);
      expect(!result.success && result.error.issues[0].path).toEqual(['providerSettings']);
    }
  });

  it('refuses a bad refresh interval', () => {
    expect(createSearchIndexSchema.safeParse({ ...valid, refreshInterval: 'soon' }).success).toBe(false);
  });
});
