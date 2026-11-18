// src/features/search/search-context.shows-no-fields.test.ts

/**
 * An index shows no fields only when the admin turned "Include in response" off for every field
 * it has set up; an index with no fields set up shows whole documents.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { showsNoFields } from './search-context.builder';

import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';

const field = (fieldName: string, includeInResponse: boolean, extra: Partial<SearchIndexField> = {}) =>
  ({ fieldName, includeInResponse, isSystemField: false, transformConfig: null, ...extra }) as SearchIndexField;

describe('showsNoFields', () => {
  it('is true when every field set up is off for responses', () => {
    expect(showsNoFields([field('name', false), field('costPrice', false)])).toBe(true);
  });

  it('is false when any field is on, or the index has no fields set up', () => {
    expect(showsNoFields([field('name', true), field('costPrice', false)])).toBe(false);
    expect(showsNoFields([])).toBe(false);
  });

  it('leaves out an unconfigured system field, which is never requested', () => {
    const emptyExtra = field('additionalData', true, { isSystemField: true, transformConfig: { mode: 'none' } as never });
    expect(showsNoFields([field('name', false), emptyExtra])).toBe(true);
    expect(showsNoFields([emptyExtra])).toBe(false);
  });
});
