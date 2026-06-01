// src/features/pipeline/v2/parameter-context.provider.ts

/**
 * Parameter Context Providers — Concrete implementations
 *
 * Each provider resolves valid values for a specific tool executor type.
 * The registry maps executor type (+ optional operation) to a provider.
 *
 * Current providers:
 *   - DataSourceSearchProvider: resolves facet values for filterable text fields
 *
 * Adding a new provider:
 *   1. Implement the ParameterContextProvider interface
 *   2. Register it in PROVIDER_REGISTRY below
 */

import { createLogger } from '@/shared/logger/logger';
import type { ToolDefinitionV2 } from './v2.types';
import type {
  ParameterContextProvider,
  ParameterContext,
  FieldConstraint,
} from './parameter-context.types';
import { EMPTY_PARAMETER_CONTEXT } from './parameter-context.types';
import { getGlobalFacetCache } from './facet-cache';
import type { DataSourceSchema, DataSourceField } from '@/db/schema/data-sources.schema';

const logger = createLogger('v2:parameter-context');

// ============================================================================
// DATA SOURCE SEARCH PROVIDER
// ============================================================================

/**
 * Resolves facet values for data_source:search tools.
 *
 * Flow:
 * 1. Read the data source schema to find filterable + facetable text fields
 * 2. Match planner hint keys against those fields
 * 3. For matching fields: check cache → fetch facets from data source → cache
 * 4. Return field constraints with valid values
 *
 * Non-text fields (number, boolean) are included as constraints with empty
 * validValues — the param extractor doesn't need value lists for those,
 * and the validation step handles type coercion.
 */
class DataSourceSearchProvider implements ParameterContextProvider {
  canEnrich(tool: ToolDefinitionV2): boolean {
    return (
      tool.executorType === 'data_source' &&
      tool.operation === 'search' &&
      tool.dataSourceId !== null
    );
  }

  async resolve(
    tool: ToolDefinitionV2,
    hints: Record<string, unknown>,
  ): Promise<ParameterContext> {
    const startTime = Date.now();
    const dataSourceId = tool.dataSourceId;

    if (!dataSourceId) {
      return EMPTY_PARAMETER_CONTEXT;
    }

    const hintKeys = Object.keys(hints);
    if (hintKeys.length === 0) {
      return {
        ...EMPTY_PARAMETER_CONTEXT,
        summary: 'No hints to resolve',
        durationMs: Date.now() - startTime,
      };
    }

    try {
      // 1. Load data source schema
      const schema = await this.loadSchema(dataSourceId);
      if (!schema) {
        logger.warn('No schema found for data source, skipping enrichment', { dataSourceId });
        return {
          ...EMPTY_PARAMETER_CONTEXT,
          summary: 'Data source schema not available',
          durationMs: Date.now() - startTime,
        };
      }

      // 2. Build a lookup of field metadata
      const fieldMap = new Map<string, DataSourceField>();
      for (const field of schema.fields) {
        fieldMap.set(field.name, field);
      }

      // 3. Build a constraint for every filterable/facetable field — hint-matched
      // or not. Carrying the full set (even fields with empty validValues) gives
      // downstream steps a complete picture of what's filterable.
      const constraints: Record<string, FieldConstraint> = {};

      for (const field of schema.fields) {
        if (!(field.isFilterable || field.isFacetable)) continue;
        constraints[field.name] = {
          fieldName: field.name,
          fieldType: this.normalizeFieldType(field.type),
          isFilterable: field.isFilterable,
          isFacetable: field.isFacetable,
          validValues: [],
          ...(field.name in hints ? { hintValue: hints[field.name] } : {}),
        };
      }

      // 4. Resolve facet values for ALL facetable text fields — not just the ones
      // the planner happened to hint. The param extractor needs the full filter
      // vocabulary to map free-text intent (e.g. "dresses", "bags") onto the
      // correct canonical value (e.g. category "Women > Dresses"); restricting to
      // hinted fields meant whole filter dimensions were invisible to it. Values
      // are globally cached, so repeat turns don't re-enumerate. (Generic across
      // data sources — nothing catalog-specific here.)
      const fieldsToResolve = schema.fields
        .filter(
          (f) =>
            f.isFilterable &&
            f.isFacetable &&
            this.normalizeFieldType(f.type) === 'text',
        )
        .map((f) => f.name);

      if (fieldsToResolve.length > 0) {
        const resolvedValues = await this.resolveFacetValues(dataSourceId, fieldsToResolve);

        for (const [fieldName, values] of Object.entries(resolvedValues)) {
          if (constraints[fieldName]) {
            constraints[fieldName].validValues = values;
          }
        }
      }

      const enrichedCount = Object.values(constraints).filter(
        (c) => c.validValues.length > 0,
      ).length;
      const hintMatchedCount = hintKeys.filter((k) => fieldMap.has(k)).length;
      const hintMissedCount = hintKeys.length - hintMatchedCount;

      const durationMs = Date.now() - startTime;

      logger.info('Parameter context resolved', {
        dataSourceId,
        hintKeys,
        hintMatchedCount,
        hintMissedCount,
        matchedFields: Object.keys(constraints).length,
        enrichedFields: enrichedCount,
        durationMs,
      });

      // Build a clear summary distinguishing hint matches from available fields
      let summary: string;
      if (enrichedCount > 0) {
        summary = `Resolved ${enrichedCount} field(s) with facet values: ${Object.keys(constraints).filter((k) => constraints[k].validValues.length > 0).join(', ')}`;
      } else if (hintMatchedCount > 0) {
        summary = `${hintMatchedCount}/${hintKeys.length} hint(s) matched schema fields (not facetable)`;
      } else {
        summary = `No hint keys matched schema fields`;
      }
      if (hintMissedCount > 0) {
        summary += `. ${hintMissedCount} hint(s) did not match any field`;
      }

      return {
        fieldConstraints: constraints,
        enriched: enrichedCount > 0,
        summary,
        durationMs,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Parameter context resolution failed', err, { dataSourceId });

      return {
        ...EMPTY_PARAMETER_CONTEXT,
        summary: `Enrichment failed: ${err.message}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  private async loadSchema(dataSourceId: string): Promise<DataSourceSchema | null> {
    const { getDataSourceById } = await import(
      '@/features/data-source/data-source.service'
    );
    const ds = await getDataSourceById(dataSourceId);
    return (ds?.schema as DataSourceSchema) ?? null;
  }

  /**
   * Resolve facet values for multiple fields, using cache where available.
   * Returns a map of fieldName → distinct values.
   */
  private async resolveFacetValues(
    dataSourceId: string,
    fieldNames: string[],
  ): Promise<Record<string, string[]>> {
    const cache = getGlobalFacetCache();
    const result: Record<string, string[]> = {};
    const uncachedFields: string[] = [];

    // Check cache first
    for (const field of fieldNames) {
      const cached = cache.get(dataSourceId, field);
      if (cached !== null) {
        result[field] = cached;
      } else {
        uncachedFields.push(field);
      }
    }

    // Fetch uncached fields from data source
    if (uncachedFields.length > 0) {
      const freshValues = await this.fetchFacetValues(dataSourceId, uncachedFields);

      for (const [field, values] of Object.entries(freshValues)) {
        result[field] = values;
        cache.set(dataSourceId, field, values);
      }
    }

    return result;
  }

  /**
   * Fetch facet values from the data source for the given fields.
   * Uses the existing enumerate executor infrastructure.
   */
  private async fetchFacetValues(
    dataSourceId: string,
    fieldNames: string[],
  ): Promise<Record<string, string[]>> {
    const { executeDataSourceEnumerate } = await import(
      '@/features/tools/executors/data-source/enumerate'
    );

    const result: Record<string, string[]> = {};

    // Fetch each field in parallel
    const promises = fieldNames.map(async (field) => {
      try {
        const enumResult = await executeDataSourceEnumerate(
          dataSourceId,
          { maxValues: 100 },
          { field, maxValues: 100 },
        );

        if (enumResult.success && enumResult.data) {
          const data = enumResult.data as {
            values?: Array<{ value: unknown; count: number }>;
          };
          const values = (data.values ?? [])
            .map((v) => String(v.value))
            .filter(Boolean);
          result[field] = values;
        } else {
          logger.warn('Facet fetch failed for field', {
            dataSourceId,
            field,
            error: enumResult.error,
          });
          result[field] = [];
        }
      } catch (err) {
        logger.warn('Facet fetch threw for field', {
          dataSourceId,
          field,
          error: err instanceof Error ? err.message : String(err),
        });
        result[field] = [];
      }
    });

    await Promise.all(promises);
    return result;
  }

  /**
   * Normalize data source field type to our simplified type system.
   */
  private normalizeFieldType(dsType: string): FieldConstraint['fieldType'] {
    switch (dsType.toLowerCase()) {
      case 'number':
      case 'integer':
      case 'long':
      case 'double':
      case 'float':
      case 'int32':
      case 'int64':
      case 'edm.int32':
      case 'edm.int64':
      case 'edm.double':
        return 'number';
      case 'boolean':
      case 'edm.boolean':
        return 'boolean';
      case 'date':
      case 'datetime':
      case 'edm.datetimeoffset':
        return 'date';
      default:
        return 'text';
    }
  }
}

// ============================================================================
// PROVIDER REGISTRY
// ============================================================================

/**
 * Registry of parameter context providers, keyed by "executorType" or
 * "executorType:operation" for more specific matching.
 *
 * Lookup order:
 *   1. "executorType:operation" (e.g., "data_source:search")
 *   2. "executorType" (e.g., "data_source")
 *   3. null (no provider)
 */
const PROVIDER_REGISTRY = new Map<string, ParameterContextProvider>([
  ['data_source:search', new DataSourceSearchProvider()],
]);

/**
 * Look up the provider for a given tool.
 */
export function getProviderForTool(
  tool: ToolDefinitionV2,
): ParameterContextProvider | null {
  // Try specific key first: "executorType:operation"
  if (tool.operation) {
    const specific = PROVIDER_REGISTRY.get(`${tool.executorType}:${tool.operation}`);
    if (specific && specific.canEnrich(tool)) return specific;
  }

  // Try broad key: "executorType"
  const broad = PROVIDER_REGISTRY.get(tool.executorType);
  if (broad && broad.canEnrich(tool)) return broad;

  return null;
}

/**
 * Resolve parameter context for a tool + hints.
 * Top-level entry point called by the execution loop.
 * Returns EMPTY_PARAMETER_CONTEXT if no provider applies.
 */
export async function resolveParameterContext(
  tool: ToolDefinitionV2,
  hints: Record<string, unknown>,
): Promise<ParameterContext> {
  const provider = getProviderForTool(tool);

  if (!provider) {
    return EMPTY_PARAMETER_CONTEXT;
  }

  return provider.resolve(tool, hints);
}

// Exported for testing
export { DataSourceSearchProvider as _DataSourceSearchProvider };
