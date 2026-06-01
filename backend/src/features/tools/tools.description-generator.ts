// src/features/tools/tools.description-generator.ts

/**
 * AI Description & Input Schema Generator
 *
 * Generates high-quality AI descriptions and input schemas for tools
 * based on the data source schema and operation type. This is the key
 * advantage of single-purpose tools: each description is focused and
 * precise, telling the LLM exactly what this tool does and how to call it.
 *
 * Used by:
 * - Tool creation wizard (pre-fill aiDescription + inputSchema)
 * - "Create Tools" shortcut on data source detail page
 * - API endpoint for on-demand generation
 */

import type { DataSourceField, DataSourceSchema } from '@/db/schema/data-sources.schema';
import {
  getOperationCapability,
  type DataSourceType,
  type DataSourceOperation,
} from './tools.registry';
import { EXECUTOR_INPUT_SCHEMAS } from './tools.executor';

// ============================================================================
// MAIN API
// ============================================================================

export interface GeneratedToolDescription {
  /** Natural language description for the LLM */
  aiDescription: string;
  /** JSON Schema for tool input parameters */
  inputSchema: Record<string, unknown>;
}

/**
 * Generate an AI description and input schema for a data source tool.
 *
 * @param dataSourceName - Human-readable data source name
 * @param dataSourceType - The data source type
 * @param operation - The operation this tool performs
 * @param schema - The data source's field schema (optional, enhances quality)
 */
export function generateToolDescription(
  dataSourceName: string,
  dataSourceType: DataSourceType,
  operation: DataSourceOperation,
  schema?: DataSourceSchema | null,
): GeneratedToolDescription {
  const fields = schema?.fields ?? [];

  const aiDescription = buildAiDescription(dataSourceName, dataSourceType, operation, fields);
  const inputSchema = buildInputSchema(operation, fields);

  return { aiDescription, inputSchema };
}

// ============================================================================
// AI DESCRIPTION BUILDER
// ============================================================================

function buildAiDescription(
  dataSourceName: string,
  dataSourceType: DataSourceType,
  operation: DataSourceOperation,
  fields: DataSourceField[],
): string {
  // Start with the template from the registry
  const capability = getOperationCapability(dataSourceType, operation);
  if (!capability) {
    return `Perform ${operation} on "${dataSourceName}".`;
  }

  // Build field list for template substitution
  const fieldList = buildFieldListString(fields, operation);

  // Apply template
  let description = capability.aiDescriptionTemplate
    .replace('{dataSourceName}', dataSourceName)
    .replace('{fieldList}', fieldList);

  // Append operation-specific field details
  const fieldDetails = buildFieldDetails(fields, operation);
  if (fieldDetails) {
    description += '\n\n' + fieldDetails;
  }

  return description;
}

/**
 * Build a concise field list string for the AI description.
 */
function buildFieldListString(fields: DataSourceField[], operation: DataSourceOperation): string {
  if (fields.length === 0) return '(schema not yet discovered)';

  switch (operation) {
    case 'search': {
      const searchable = fields.filter(f => f.isSearchable).map(f => f.name);
      const filterable = fields.filter(f => f.isFilterable || f.isFacetable).map(f => f.name);
      const parts: string[] = [];
      if (searchable.length > 0) parts.push(`searchable: ${searchable.join(', ')}`);
      if (filterable.length > 0) parts.push(`filterable: ${filterable.join(', ')}`);
      return parts.join('; ') || fields.map(f => f.name).join(', ');
    }

    case 'inspect':
      return `${fields.length} fields available`;

    case 'enumerate': {
      const filterable = fields.filter(f => f.isFilterable || f.isFacetable);
      return filterable.length > 0
        ? filterable.map(f => f.name).join(', ')
        : fields.map(f => f.name).join(', ');
    }

    case 'lookup':
      return fields.map(f => f.name).join(', ');

    case 'query':
      return fields.map(f => f.name).join(', ');

    default:
      return fields.map(f => f.name).join(', ');
  }
}

/**
 * Build detailed field information appended to the AI description.
 * This gives the LLM concrete knowledge about what fields exist and how to use them.
 */
function buildFieldDetails(fields: DataSourceField[], operation: DataSourceOperation): string | null {
  if (fields.length === 0) return null;

  switch (operation) {
    case 'search':
      return buildSearchFieldDetails(fields);

    case 'enumerate':
      return buildEnumerateFieldDetails(fields);

    case 'lookup':
      return buildLookupFieldDetails(fields);

    default:
      return null;
  }
}

function buildSearchFieldDetails(fields: DataSourceField[]): string | null {
  const filterableFields = fields.filter(f => f.isFilterable || f.isFacetable);
  const sortableFields = fields.filter(f => f.type !== 'text' && f.type !== 'vector');

  const lines: string[] = [];

  if (filterableFields.length > 0) {
    lines.push('Available filters:');
    for (const f of filterableFields) {
      const ops = getOperatorsForFieldType(f.type);
      const roleHint = f.role ? ` (${f.role})` : '';
      lines.push(`- ${f.name} (${f.type}${roleHint}): ${ops.join(', ')}`);
    }
  }

  if (sortableFields.length > 0) {
    lines.push('');
    lines.push(`Sortable fields: ${sortableFields.map(f => f.name).join(', ')}`);
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function buildEnumerateFieldDetails(fields: DataSourceField[]): string | null {
  const filterable = fields.filter(f => f.isFilterable || f.isFacetable);
  if (filterable.length === 0) return null;

  const lines = ['Fields you can enumerate:'];
  for (const f of filterable) {
    const roleHint = f.role ? ` (${f.role})` : '';
    lines.push(`- ${f.name} (${f.type}${roleHint})`);
  }
  return lines.join('\n');
}

function buildLookupFieldDetails(fields: DataSourceField[]): string | null {
  const idField = fields.find(f => f.role === 'id');
  if (!idField) return null;
  return `The document ID field is "${idField.name}".`;
}

/**
 * Get the valid filter operators for a field type.
 */
function getOperatorsForFieldType(type: string): string[] {
  switch (type) {
    case 'text':
    case 'keyword':
      return ['eq', 'neq', 'in', 'contains'];
    case 'number':
    case 'integer':
    case 'float':
    case 'double':
      return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'range'];
    case 'date':
    case 'datetime':
      return ['eq', 'gt', 'gte', 'lt', 'lte', 'range'];
    case 'boolean':
      return ['eq'];
    default:
      return ['eq', 'neq'];
  }
}

// ============================================================================
// INPUT SCHEMA BUILDER
// ============================================================================

/**
 * Build a JSON Schema for the tool's input parameters.
 * For search tools, enriches the base schema with field-specific filter documentation.
 */
function buildInputSchema(
  operation: DataSourceOperation,
  fields: DataSourceField[],
): Record<string, unknown> {
  const schemaKey = `data_source:${operation}`;
  const baseSchema = EXECUTOR_INPUT_SCHEMAS[schemaKey] as Record<string, unknown> | undefined;

  if (!baseSchema) {
    return { type: 'object', properties: {}, required: [] };
  }

  // Deep clone the base schema
  const schema = JSON.parse(JSON.stringify(baseSchema)) as Record<string, unknown>;

  // Enrich search schema with field-specific filter info
  if (operation === 'search' && fields.length > 0) {
    enrichSearchSchema(schema, fields);
  }

  // Enrich enumerate schema with available field names
  if (operation === 'enumerate' && fields.length > 0) {
    enrichEnumerateSchema(schema, fields);
  }

  return schema;
}

function enrichSearchSchema(schema: Record<string, unknown>, fields: DataSourceField[]): void {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties?.filters?.items) return;

  const filterableFields = fields.filter(f => f.isFilterable || f.isFacetable);
  if (filterableFields.length === 0) return;

  // Add field enum to the filter schema
  const items = properties.filters.items as Record<string, unknown>;
  const itemProps = items.properties as Record<string, Record<string, unknown>> | undefined;
  if (itemProps?.field) {
    itemProps.field.enum = filterableFields.map(f => f.name);
    itemProps.field.description = `Field to filter on. Available: ${filterableFields.map(f => `${f.name} (${f.type})`).join(', ')}`;
  }
}

function enrichEnumerateSchema(schema: Record<string, unknown>, fields: DataSourceField[]): void {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties?.field) return;

  const filterable = fields.filter(f => f.isFilterable || f.isFacetable);
  if (filterable.length > 0) {
    properties.field.enum = filterable.map(f => f.name);
    properties.field.description = `Field to enumerate values for. Available: ${filterable.map(f => f.name).join(', ')}`;
  }
}
