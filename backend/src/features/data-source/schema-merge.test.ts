import { describe, expect, it } from 'vitest';

import { mergeOperatorFieldEdits } from './data-source.service';

import type { DataSourceSchema } from '@/db/schema/data-sources.schema';

/**
 * A health check rediscovers the schema from the index and writes it back. Everything in
 * that payload is derived from the index — except the field descriptions, which exist only
 * because a person typed them and which are rendered into the planning prompt.
 *
 * Before this merge the write was wholesale, so every health check silently deleted them:
 * the save reported success, the text was gone, and the only symptom was a description box
 * that emptied itself.
 */

function schema(fields: Array<Record<string, unknown>>): DataSourceSchema {
  return { fields: fields as unknown as DataSourceSchema['fields'] };
}

describe('mergeOperatorFieldEdits', () => {
  it('carries an operator description across a rediscovery', () => {
    const stored = schema([
      { name: 'category', type: 'text', description: 'Breadcrumb path, not a flat name.' },
    ]);
    const discovered = schema([{ name: 'category', type: 'text', providerType: 'Edm.String' }]);

    const merged = mergeOperatorFieldEdits(stored, discovered);

    expect(merged.fields[0].description).toBe('Breadcrumb path, not a flat name.');
    // Discovery still wins on everything it actually knows about.
    expect(merged.fields[0].providerType).toBe('Edm.String');
  });

  it('does not resurrect a description for a field the index no longer has', () => {
    // Advertising a field that is gone is how the planner ends up filtering on something
    // that can never match.
    const stored = schema([{ name: 'retired', type: 'text', description: 'Used to exist.' }]);
    const discovered = schema([{ name: 'name', type: 'text' }]);

    const merged = mergeOperatorFieldEdits(stored, discovered);

    expect(merged.fields).toHaveLength(1);
    expect(merged.fields[0].name).toBe('name');
  });

  it('prefers a description discovery supplied over the stored one', () => {
    const stored = schema([{ name: 'sku', type: 'text', description: 'operator text' }]);
    const discovered = schema([{ name: 'sku', type: 'text', description: 'from the index' }]);

    expect(mergeOperatorFieldEdits(stored, discovered).fields[0].description).toBe('from the index');
  });

  it('treats a blank description as nothing to carry', () => {
    const stored = schema([{ name: 'sku', type: 'text', description: '   ' }]);
    const discovered = schema([{ name: 'sku', type: 'text' }]);

    expect(mergeOperatorFieldEdits(stored, discovered).fields[0].description).toBeUndefined();
  });

  it('returns the discovered schema untouched when there is nothing stored', () => {
    const discovered = schema([{ name: 'sku', type: 'text' }]);

    expect(mergeOperatorFieldEdits(null, discovered)).toBe(discovered);
    expect(mergeOperatorFieldEdits(undefined, discovered)).toBe(discovered);
    expect(mergeOperatorFieldEdits(schema([]), discovered)).toBe(discovered);
  });

  it('leaves every other field alone', () => {
    const stored = schema([{ name: 'a', type: 'text', description: 'kept' }]);
    const discovered = schema([
      { name: 'a', type: 'text' },
      { name: 'b', type: 'text' },
      { name: 'c', type: 'text' },
    ]);

    const merged = mergeOperatorFieldEdits(stored, discovered);

    expect(merged.fields.map((f) => f.description)).toEqual(['kept', undefined, undefined]);
  });
});
