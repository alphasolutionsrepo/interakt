// src/shared/constants/field-types.ts

/**
 * Field Types for Data Templates
 * SINGLE SOURCE OF TRUTH - matches database enum and Elasticsearch types
 * 
 * NOTE: When adding/removing types, also update:
 * - db/schema/enums.schema.ts (fieldTypeEnum)
 */

export const FIELD_TYPES = [
  'text',
  'keyword',
  'number',
  'boolean',
  'date',
  'datetime',
  'url',
  'email',
  'json',
  'array',
  'image_url',
] as const;

export type FieldType = typeof FIELD_TYPES[number];

/**
 * Types whose values are strings in the search engine and can therefore take
 * part in a full-text query. Sending the query text to a number, date or
 * boolean field makes Elasticsearch reject the whole request ("failed to create
 * query: For input string") and Azure refuse the field in searchFields.
 *
 * `array` is included because tag-style string arrays are common and searched
 * today; a numeric array is tolerated at query time by the lenient multi_match.
 */
export const FULL_TEXT_SEARCHABLE_FIELD_TYPES = [
  'text',
  'keyword',
  'url',
  'email',
  'image_url',
  'array',
] as const;

export function isFullTextSearchableFieldType(fieldType: string): boolean {
  return (FULL_TEXT_SEARCHABLE_FIELD_TYPES as readonly string[]).includes(fieldType);
}

/**
 * Field type metadata for UI and documentation
 */
export const FIELD_TYPE_INFO: Record<FieldType, {
  label: string;
  description: string;
  elasticsearchType: string;
  example?: string;
}> = {
  text: {
    label: 'Text',
    description: 'Full-text searchable content (analyzed)',
    elasticsearchType: 'text',
    example: 'Product descriptions, article content',
  },
  keyword: {
    label: 'Keyword',
    description: 'Exact-match, filterable, sortable (not analyzed)',
    elasticsearchType: 'keyword',
    example: 'IDs, SKUs, categories, tags',
  },
  number: {
    label: 'Number',
    description: 'Numeric values (integer or float)',
    elasticsearchType: 'long/double',
    example: 'Prices, quantities, ratings',
  },
  boolean: {
    label: 'Boolean',
    description: 'True/false values',
    elasticsearchType: 'boolean',
    example: 'In stock, featured, active',
  },
  date: {
    label: 'Date',
    description: 'Date only (no time)',
    elasticsearchType: 'date',
    example: '2025-01-15',
  },
  datetime: {
    label: 'Date & Time',
    description: 'Full timestamp with date and time',
    elasticsearchType: 'date',
    example: '2025-01-15T14:30:00Z',
  },
  url: {
    label: 'URL',
    description: 'Web addresses',
    elasticsearchType: 'keyword',
    example: 'https://example.com/page',
  },
  email: {
    label: 'Email',
    description: 'Email addresses',
    elasticsearchType: 'keyword',
    example: 'user@example.com',
  },
  json: {
    label: 'JSON Object',
    description: 'Structured JSON data',
    elasticsearchType: 'object/nested',
    example: '{ "key": "value" }',
  },
  array: {
    label: 'Array',
    description: 'List of values',
    elasticsearchType: 'array of any type',
    example: '["tag1", "tag2", "tag3"]',
  },
  image_url: {
    label: 'Image URL',
    description: 'Image file URLs',
    elasticsearchType: 'keyword',
    example: 'https://cdn.example.com/image.jpg',
  },
};