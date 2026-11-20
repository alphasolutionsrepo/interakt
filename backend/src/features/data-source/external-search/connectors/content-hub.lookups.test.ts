// src/features/data-source/external-search/connectors/content-hub.lookups.test.ts

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/http/same-server-fetch', () => ({ fetchOnSameServer: vi.fn(), connectFailure: () => 'unreachable' }));

import { itemLabel } from './content-hub.lookups';

describe('itemLabel', () => {
  it('prefers the usual label properties', () => {
    expect(itemLabel({ TaxonomyLabel: 'Cabinets', Name: 'cab' })).toBe('Cabinets');
    expect(itemLabel({ StatusValue: 'Approved' })).toBe('Approved');
  });

  it('accepts a definition-specific text property ending in Name, Label or Title', () => {
    expect(itemLabel({ identifier: 'M.PCM.ProductStatus.Created', ProductStatusName: 'Created', SortOrder: null })).toBe('Created');
    expect(itemLabel({ identifier: 'X', CommunityTitle: 'Harbor' })).toBe('Harbor');
  });

  it('falls back to the identifier when nothing names the item', () => {
    expect(itemLabel({ identifier: 'M.Thing.1', Code: 'A1' })).toBe('M.Thing.1');
    expect(itemLabel({ id: 7 })).toBe('7');
  });
});
