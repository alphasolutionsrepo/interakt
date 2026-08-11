// src/features/tools/executors/external-query.ts

/**
 * Filter and sort translation for external data-source providers.
 *
 * Managed indexes go through the search service, which builds provider queries from
 * FilterClause/SortClause already. External data sources bypass that: the executors call
 * provider REST APIs directly. Until this module existed they simply never forwarded
 * `filters` or `sort`, so a planned filter was accepted, reported as a success, and had
 * no effect on the results.
 *
 * Operator semantics are NOT reimplemented here — Azure delegates to buildAzureFilter and
 * Elasticsearch to buildOperatorQuery, the same builders the standalone search path uses.
 * What this module owns is the part those builders can't know about: resolving a field
 * against a *discovered* schema, and deciding what to do when the provider cannot express
 * what was asked.
 *
 * Anything untranslatable is returned in `unapplied` rather than dropped, because a filter
 * that vanished silently is worse than one the caller knows was ignored.
 */

import type { DataSourceField } from '@/db/schema/data-sources.schema';
import { buildAzureFilter } from '@/features/search/providers/azure-ai-search/query-builders/filter.builder';
import {
  buildOperatorQuery,
  type ESQuery,
} from '@/features/search/providers/elasticsearch/query-builders/filter.builder';
import type { FilterClause, FilterOperator, SortClause } from '@/features/search/search.types';

// ============================================================================
// TYPES
// ============================================================================

/** A requested clause the provider could not express, with the reason. */
export interface UnappliedClause {
  field: string;
  operator?: string;
  reason: string;
}

export interface TranslatedFilters {
  /** OData $filter expression (Azure AI Search). */
  odata?: string;
  /** Query DSL clauses to AND into the query (Elasticsearch). */
  esClauses?: ESQuery[];
  unapplied: UnappliedClause[];
}

export interface TranslatedSort {
  /** OData $orderby expression (Azure AI Search). */
  odataOrderBy?: string;
  /** Sort array (Elasticsearch). */
  esSort?: Array<Record<string, { order: 'asc' | 'desc' }>>;
  unapplied: UnappliedClause[];
}

/** Boolean combinations never reach these executors — tool input schemas are flat. */
const BOOLEAN_OPERATORS = new Set<string>(['and', 'or', 'not']);

// ============================================================================
// FIELD RESOLUTION
// ============================================================================

interface FieldLookup {
  get(name: string): DataSourceField | undefined;
  /**
   * True when there is no discovered schema at all. Field-level checks are meaningless
   * then, so translation runs best-effort instead of rejecting everything: attempting a
   * filter and surfacing a provider error beats dropping it, which is what used to happen.
   */
  readonly isEmpty: boolean;
}

function fieldLookup(fields: DataSourceField[] | undefined): FieldLookup {
  const map = new Map((fields ?? []).map((f) => [f.name, f]));
  return { get: (name) => map.get(name), isEmpty: map.size === 0 };
}

/**
 * Resolve a requested field for filtering, or explain why it can't be.
 *
 * `null` field means "no schema to check against" — proceed without type information.
 */
function resolveFilterField(
  lookup: FieldLookup,
  name: string,
): { field: DataSourceField | null } | { reason: string } {
  if (lookup.isEmpty) return { field: null };

  const field = lookup.get(name);
  if (!field) {
    return { reason: 'field is not present in the discovered schema' };
  }
  if (field.isFilterable === false) {
    return { reason: 'field is not filterable on this index' };
  }
  return { field };
}

// ============================================================================
// AZURE AI SEARCH
// ============================================================================

/**
 * Map a field to the type vocabulary buildAzureFilter expects.
 *
 * Driven by `providerType` (the verbatim Azure type) rather than the normalized `type`,
 * because normalization flattens `Collection(Edm.String)` to `text` — and comparing an
 * Azure collection without a lambda expression is a 400, not a wrong result.
 */
function azureFieldType(field: DataSourceField | null): string {
  switch (field?.providerType) {
    case 'Collection(Edm.String)':
    case 'Collection(Edm.Int32)':
    case 'Collection(Edm.Int64)':
    case 'Collection(Edm.Double)':
      return 'array';
    case 'Edm.Int32':
    case 'Edm.Int64':
    case 'Edm.Double':
    case 'Edm.Single':
      return 'number';
    case 'Edm.Boolean':
      return 'boolean';
    case 'Edm.DateTimeOffset':
      return 'date';
    case 'Edm.String':
      return 'keyword';
    default:
      // No providerType (schema predates it) — fall back to the normalized label. Loses
      // collection awareness, which is why a health check re-run is worth prompting for.
      return field?.type === 'number' || field?.type === 'boolean' || field?.type === 'date'
        ? field.type
        : 'keyword';
  }
}

function translateAzureFilters(
  filters: FilterClause[],
  lookup: FieldLookup,
): TranslatedFilters {
  const unapplied: UnappliedClause[] = [];
  const usable: FilterClause[] = [];
  const fieldTypes = new Map<string, { fieldType: string }>();

  for (const filter of filters) {
    if (BOOLEAN_OPERATORS.has(filter.operator)) {
      unapplied.push({
        field: filter.field,
        operator: filter.operator,
        reason: 'boolean filter combinations are not supported on external data sources',
      });
      continue;
    }

    const resolved = resolveFilterField(lookup, filter.field);
    if ('reason' in resolved) {
      unapplied.push({ field: filter.field, operator: filter.operator, reason: resolved.reason });
      continue;
    }

    fieldTypes.set(filter.field, { fieldType: azureFieldType(resolved.field) });
    usable.push(filter);
  }

  if (usable.length === 0) return { unapplied };

  const odata = buildAzureFilter(usable, fieldTypes);

  // buildAzureFilter drops clauses it cannot express (unknown operator, empty `in` list)
  // and returns undefined when nothing survives. Report that rather than losing it.
  if (!odata) {
    for (const filter of usable) {
      unapplied.push({
        field: filter.field,
        operator: filter.operator,
        reason: 'operator cannot be expressed as an OData filter',
      });
    }
    return { unapplied };
  }

  return { odata, unapplied };
}

function translateAzureSort(sort: SortClause[], lookup: FieldLookup): TranslatedSort {
  const unapplied: UnappliedClause[] = [];
  const parts: string[] = [];

  for (const clause of sort) {
    if (lookup.isEmpty) {
      parts.push(`${clause.field} ${clause.direction}`);
      continue;
    }

    const field = lookup.get(clause.field);
    if (!field) {
      unapplied.push({ field: clause.field, reason: 'field is not present in the discovered schema' });
      continue;
    }
    // Azure rejects the entire request for an unsortable field, so an unverified sort
    // would cost the whole search rather than just the ordering. `undefined` (schema
    // discovered before sortability was recorded) is treated as unverified on purpose.
    if (field.isSortable !== true) {
      unapplied.push({
        field: clause.field,
        reason: field.isSortable === false
          ? 'field is not sortable on this index'
          : 'sortability is unknown for this field — re-run a health check to refresh the schema',
      });
      continue;
    }
    parts.push(`${clause.field} ${clause.direction}`);
  }

  return parts.length > 0 ? { odataOrderBy: parts.join(', '), unapplied } : { unapplied };
}

// ============================================================================
// ELASTICSEARCH
// ============================================================================

/**
 * Choose the field name and type to hand buildOperatorQuery.
 *
 * `text` fields are analyzed, so a term query against them matches only when the whole
 * analyzed token happens to equal the value. Exact-match operators go to the `keyword`
 * sub-field discovery recorded; `contains` deliberately stays on the analyzed field,
 * where match_phrase_prefix is the better tool.
 */
function esTarget(
  field: DataSourceField | null,
  name: string,
  operator: FilterOperator,
): { field: string; fieldType: string } {
  const isAnalyzedText = field?.providerType === 'text' || field?.providerType === 'search_as_you_type';

  if (operator === 'contains' && isAnalyzedText) {
    return { field: name, fieldType: 'text' };
  }
  if (operator === 'exists' || operator === 'missing') {
    return { field: name, fieldType: 'keyword' };
  }

  // 'keyword' suppresses the builder's own `.keyword` suffixing — the sub-field name is
  // already resolved here, from the mapping rather than by convention.
  return { field: field?.filterField ?? name, fieldType: 'keyword' };
}

function translateElasticsearchFilters(
  filters: FilterClause[],
  lookup: FieldLookup,
): TranslatedFilters {
  const unapplied: UnappliedClause[] = [];
  const esClauses: ESQuery[] = [];

  for (const filter of filters) {
    if (BOOLEAN_OPERATORS.has(filter.operator)) {
      unapplied.push({
        field: filter.field,
        operator: filter.operator,
        reason: 'boolean filter combinations are not supported on external data sources',
      });
      continue;
    }

    const resolved = resolveFilterField(lookup, filter.field);
    if ('reason' in resolved) {
      unapplied.push({ field: filter.field, operator: filter.operator, reason: resolved.reason });
      continue;
    }

    const target = esTarget(resolved.field, filter.field, filter.operator);
    try {
      esClauses.push(buildOperatorQuery(target.field, filter.operator, filter.value, target.fieldType));
    } catch (error) {
      // buildOperatorQuery throws SearchError for an unsupported operator or a malformed
      // value. One bad clause must not cost the whole search.
      unapplied.push({
        field: filter.field,
        operator: filter.operator,
        reason: error instanceof Error ? error.message : 'filter could not be translated',
      });
    }
  }

  return esClauses.length > 0 ? { esClauses, unapplied } : { unapplied };
}

function translateElasticsearchSort(sort: SortClause[], lookup: FieldLookup): TranslatedSort {
  const unapplied: UnappliedClause[] = [];
  const esSort: Array<Record<string, { order: 'asc' | 'desc' }>> = [];

  for (const clause of sort) {
    if (lookup.isEmpty) {
      esSort.push({ [clause.field]: { order: clause.direction } });
      continue;
    }

    const field = lookup.get(clause.field);
    if (!field) {
      unapplied.push({ field: clause.field, reason: 'field is not present in the discovered schema' });
      continue;
    }
    // Sorting an analyzed text field without a keyword sub-field is an error in ES
    // ("Fielddata is disabled on text fields by default"), which fails the whole request.
    if (field.isSortable !== true) {
      unapplied.push({
        field: clause.field,
        reason: field.isSortable === false
          ? 'field is not sortable on this index'
          : 'sortability is unknown for this field — re-run a health check to refresh the schema',
      });
      continue;
    }
    esSort.push({ [field.filterField ?? clause.field]: { order: clause.direction } });
  }

  return esSort.length > 0 ? { esSort, unapplied } : { unapplied };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Translate provider-agnostic filters for an external provider.
 *
 * Returns an empty result (no expression, no `unapplied`) when there is nothing to do,
 * so callers can spread the output unconditionally.
 */
export function translateFilters(
  provider: string,
  filters: FilterClause[] | undefined,
  fields: DataSourceField[] | undefined,
): TranslatedFilters {
  if (!filters?.length) return { unapplied: [] };

  const lookup = fieldLookup(fields);
  switch (provider) {
    case 'azure-ai-search':
      return translateAzureFilters(filters, lookup);
    case 'elasticsearch':
      return translateElasticsearchFilters(filters, lookup);
    default:
      return {
        unapplied: filters.map((f) => ({
          field: f.field,
          operator: f.operator,
          reason: `filtering is not implemented for provider '${provider}'`,
        })),
      };
  }
}

/** Translate provider-agnostic sort clauses for an external provider. */
export function translateSort(
  provider: string,
  sort: SortClause[] | undefined,
  fields: DataSourceField[] | undefined,
): TranslatedSort {
  if (!sort?.length) return { unapplied: [] };

  const lookup = fieldLookup(fields);
  switch (provider) {
    case 'azure-ai-search':
      return translateAzureSort(sort, lookup);
    case 'elasticsearch':
      return translateElasticsearchSort(sort, lookup);
    default:
      return {
        unapplied: sort.map((s) => ({
          field: s.field,
          reason: `sorting is not implemented for provider '${provider}'`,
        })),
      };
  }
}
