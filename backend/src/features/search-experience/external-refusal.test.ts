// src/features/search-experience/external-refusal.test.ts

/**
 * Which external engines' 400s are read for a bad filter or sort, and under which names.
 * What the reason blames is in features/search/request-refusal.test.ts.
 */

import { describe, expect, it } from 'vitest';

import { refusedRequest } from './external-refusal';

import type { DataSourceField } from '@/db/schema/data-sources.schema';
import { ExternalSearchError } from '@/features/data-source/external-search/external-search.types';
import type { SearchRequest } from '@/features/search/search.types';

const es = (reason: string, status = 400) => new ExternalSearchError('Elasticsearch', `Elasticsearch returned HTTP ${status}: ${reason}`, status);
const badRating: SearchRequest = { query: 'x', filters: [{ field: 'rating', operator: 'gt', value: 'abc' }] };

describe('refusedRequest', () => {
  it('reads an Elasticsearch 400', () => {
    expect(refusedRequest(es('failed to create query: For input string: "abc"'), badRating, [])).toMatchObject({ code: 'INVALID_FILTER' });
  });

  it('reads an Azure AI Search 400', () => {
    const azure = new ExternalSearchError('Azure AI Search', "Azure AI Search returned HTTP 400: Could not find a property named 'rating'", 400);
    expect(refusedRequest(azure, badRating, [])).toMatchObject({ code: 'INVALID_FILTER' });
  });

  it('blames the field by the name it was sent to the engine as', () => {
    const fields = [{ name: 'name', filterField: 'name.keyword' }] as DataSourceField[];
    const refused = refusedRequest(es('No mapping found for [name.keyword] in order to sort on'), { query: 'x', sort: [{ field: 'name', direction: 'asc' }] }, fields);
    expect(refused).toMatchObject({ code: 'INVALID_SORT', message: "This search source can't sort on name" });
  });

  it('leaves engines whose wording is unknown alone', () => {
    const sitecore = new ExternalSearchError('Sitecore Search', 'Sitecore Search returned HTTP 400: {"type":"bad_request","field":"rating"}', 400);
    expect(refusedRequest(sitecore, badRating, [])).toBeUndefined();
  });

  it('leaves anything but a 400 from an engine alone', () => {
    expect(refusedRequest(es('For input string: "abc"', 500), badRating, [])).toBeUndefined();
    expect(refusedRequest(new Error('For input string: "abc"'), badRating, [])).toBeUndefined();
  });

  it('keeps the engine error as the cause, for the log', () => {
    const error = es('For input string: "abc"');
    expect(refusedRequest(error, badRating, [])?.cause).toBe(error);
  });
});
