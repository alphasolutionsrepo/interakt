// app/tools/_lib/azure-schema-parser.ts
//
// Parses an Azure AI Search index definition JSON and generates a JSON Schema
// for the tool's outputSchema — specifically the `results[].data` properties.
//
// Ref: https://learn.microsoft.com/en-us/rest/api/searchservice/get-index

// ============================================================================
// EDM TYPE → JSON SCHEMA MAPPING
// ============================================================================

// Types that are vector embeddings — not useful for AI field reasoning
const SKIP_COLLECTION_TYPES = new Set([
  'Collection(Edm.Single)',
  'Collection(Edm.Double)',
  'Collection(Edm.Half)',
  'Collection(Edm.SByte)',
  'Collection(Edm.Int16)',
]);

function edmTypeToJsonSchema(
  edmType: string,
): { type: string; format?: string; items?: object } | null {
  switch (edmType) {
    case 'Edm.String':
      return { type: 'string' };
    case 'Edm.Int32':
    case 'Edm.Int64':
      return { type: 'integer' };
    case 'Edm.Double':
    case 'Edm.Single':
      return { type: 'number' };
    case 'Edm.Boolean':
      return { type: 'boolean' };
    case 'Edm.DateTimeOffset':
      return { type: 'string', format: 'date-time' };
    case 'Collection(Edm.String)':
      return { type: 'array', items: { type: 'string' } };
    case 'Collection(Edm.Int32)':
    case 'Collection(Edm.Int64)':
      return { type: 'array', items: { type: 'integer' } };
    case 'Edm.ComplexType':
      return { type: 'object' };
    default:
      if (SKIP_COLLECTION_TYPES.has(edmType)) return null;
      return { type: 'string' }; // safe fallback for unknown types
  }
}

function buildFieldDescription(field: AzureField): string {
  const hints: string[] = [];
  if (field.key) hints.push('Key field');
  if (field.searchable) hints.push('Searchable');
  if (field.filterable) hints.push('Filterable');
  if (field.sortable) hints.push('Sortable');
  if (field.facetable) hints.push('Facetable');
  return hints.join(', ');
}

// ============================================================================
// AZURE FIELD TYPE
// ============================================================================

interface AzureField {
  name: string;
  type: string;
  key?: boolean;
  retrievable?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  facetable?: boolean;
  fields?: AzureField[]; // nested ComplexType fields
}

interface AzureIndexDefinition {
  name?: string;
  fields: AzureField[];
}

// ============================================================================
// PARSE RESULT
// ============================================================================

export interface AzureSchemaParseResult {
  outputSchema: object;
  fieldCount: number;     // total retrievable fields mapped
  skippedCount: number;   // fields skipped (not retrievable, or vector types)
  indexName?: string;
  error?: never;
}

export interface AzureSchemaParseError {
  error: string;
  outputSchema?: never;
}

// ============================================================================
// MAIN PARSER
// ============================================================================

export function parseAzureIndexSchema(
  json: string,
): AzureSchemaParseResult | AzureSchemaParseError {
  let def: AzureIndexDefinition;

  try {
    def = JSON.parse(json) as AzureIndexDefinition;
  } catch {
    return { error: 'Invalid JSON — paste the full index definition from Azure portal or the REST API.' };
  }

  if (!Array.isArray(def.fields) || def.fields.length === 0) {
    return { error: 'No "fields" array found. Make sure you pasted the full index definition, not just a partial response.' };
  }

  const dataProperties: Record<string, object> = {};
  let fieldCount = 0;
  let skippedCount = 0;

  for (const field of def.fields) {
    // Skip non-retrievable fields — the AI will never see them
    if (field.retrievable === false) {
      skippedCount++;
      continue;
    }

    const jsonSchemaType = edmTypeToJsonSchema(field.type);

    if (!jsonSchemaType) {
      // Vector / unsupported collection type
      skippedCount++;
      continue;
    }

    const description = buildFieldDescription(field);
    dataProperties[field.name] = {
      ...jsonSchemaType,
      ...(description ? { description } : {}),
    };
    fieldCount++;
  }

  if (fieldCount === 0) {
    return { error: 'No retrievable fields found in this index definition. All fields may be marked retrievable: false or are vector fields.' };
  }

  const outputSchema = {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        description: 'Array of matching documents',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Document ID' },
            score: { type: 'number', description: 'Relevance score' },
            data: {
              type: 'object',
              description: 'Document fields from the Azure index',
              properties: dataProperties,
            },
            highlights: {
              type: 'object',
              description: 'Highlighted text snippets per field. Only present when includeHighlights is enabled.',
            },
          },
          required: ['id', 'score', 'data'],
        },
      },
      totalCount: {
        type: 'integer',
        description: 'Total number of matching documents',
      },
      took: {
        type: 'integer',
        description: 'Query execution time in milliseconds',
      },
    },
    required: ['results', 'totalCount'],
  };

  return {
    outputSchema,
    fieldCount,
    skippedCount,
    indexName: def.name,
  };
}
