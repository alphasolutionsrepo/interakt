// src/shared/constants/field-types.json-capability.test.ts

/**
 * Whether a json field is text in the engine is a provider capability (storesJsonAsText):
 * it decides both whether the field can be searched and whether its objects are
 * serialized on write. Neither rule names a provider.
 */

import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Lets a test flip Elasticsearch's answer, to show the rules read the capability
const flip = vi.hoisted(() => ({ storesJsonAsText: undefined as boolean | undefined }));
vi.mock('@/features/search/providers/elasticsearch/elasticsearch-capabilities', async (importActual) => {
  const { ELASTICSEARCH_CAPABILITIES: actual } = await importActual<typeof import('@/features/search/providers/elasticsearch/elasticsearch-capabilities')>();
  return {
    ELASTICSEARCH_CAPABILITIES: {
      ...actual,
      get storesJsonAsText() { return flip.storesJsonAsText ?? actual.storesJsonAsText; },
    },
  };
});

import { isFullTextSearchableFieldType } from './field-types';

import type { SearchIndexField } from '@/db/schema/search-index-fields.schema';
import { transformDocument } from '@/features/document-indexing/document-transformer.service';
import { capabilitiesOf } from '@/features/search/providers/capabilities-by-provider';

const jsonField = {
  id: 1, fieldName: 'specs', fieldType: 'json', sourceFieldName: 'specs', sourceFieldPath: null,
  isRequired: false, transformConfig: { mode: 'source', transform: 'none' },
} as unknown as SearchIndexField;
const written = (provider: 'elasticsearch' | 'azure-ai-search') =>
  transformDocument({ specs: { color: 'red' } }, [jsonField], { provider }).document.specs;

beforeEach(() => { flip.storesJsonAsText = undefined; });

describe('json fields follow the storesJsonAsText capability', () => {
  it('is text on Azure AI Search and not on Elasticsearch', () => {
    expect(capabilitiesOf('azure-ai-search')?.storesJsonAsText).toBe(true);
    expect(capabilitiesOf('elasticsearch')?.storesJsonAsText).toBe(false);
  });

  it('makes a json field searchable on Azure only, as before', () => {
    expect(isFullTextSearchableFieldType('json', 'azure-ai-search')).toBe(true);
    expect(isFullTextSearchableFieldType('json', 'elasticsearch')).toBe(false);
    expect(isFullTextSearchableFieldType('json', undefined)).toBe(false);
    expect(isFullTextSearchableFieldType('json', 'unknown')).toBe(false);
  });

  it('serializes a json object on Azure only, as before', () => {
    expect(written('azure-ai-search')).toBe('{"color":"red"}');
    expect(written('elasticsearch')).toEqual({ color: 'red' });
  });

  it('takes both answers from the capability, not the provider name', () => {
    flip.storesJsonAsText = true;
    expect(isFullTextSearchableFieldType('json', 'elasticsearch')).toBe(true);
    expect(written('elasticsearch')).toBe('{"color":"red"}');
  });

  it('is not decided anywhere else by comparing the provider to Azure', () => {
    const root = path.resolve(process.cwd(), 'src');
    const sources = (fs.readdirSync(root, { recursive: true }) as string[])
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
    const offenders = sources.filter((file) => {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      return [...text.matchAll(/[!=]==\s*'azure-ai-search'/g)]
        .some((match) => /'json'/.test(text.slice(Math.max(0, match.index - 300), match.index + 300)));
    });
    expect(offenders).toEqual([]);
  });
});
