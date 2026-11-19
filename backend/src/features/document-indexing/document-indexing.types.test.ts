// src/features/document-indexing/document-indexing.types.test.ts

/** The document upload body: free-form documents are kept as sent; bad shapes get field errors in our wording. */

import { describe, expect, it } from 'vitest';

import { documentSchema, indexDocumentsRequestSchema } from './document-indexing.types';

describe('indexDocumentsRequestSchema', () => {
  it('accepts free-form documents and keeps every field as sent', () => {
    const documents = [{ sku: 'a1', price: 9.5, tags: ['x'], nested: { deep: { n: null } } }, { other: true }];
    const parsed = indexDocumentsRequestSchema.parse({ documents, sourceFileName: 'f.json' });
    expect(parsed.documents).toEqual(documents);
    expect(parsed.sourceFileName).toBe('f.json');
  });

  it('an empty list answers on documents with too_small and "Add at least 1 item."', () => {
    const result = indexDocumentsRequestSchema.safeParse({ documents: [] });
    expect(result.success).toBe(false);
    expect(result.error!.issues).toEqual([
      expect.objectContaining({ code: 'too_small', path: ['documents'], message: 'Add at least 1 item.' }),
    ]);
  });

  it.each([['a string', 'row'], ['an array', [1, 2]]])('a document that is %s is rejected at its position', (_n, doc) => {
    const result = indexDocumentsRequestSchema.safeParse({ documents: [{ ok: 1 }, doc] });
    expect(result.success).toBe(false);
    expect(result.error!.issues).toEqual([expect.objectContaining({ code: 'invalid_type', path: ['documents', 1] })]);
  });

  it('documentSchema rejects null and a number too', () => {
    expect(documentSchema.safeParse(null).success).toBe(false);
    expect(documentSchema.safeParse(3).success).toBe(false);
  });
});
