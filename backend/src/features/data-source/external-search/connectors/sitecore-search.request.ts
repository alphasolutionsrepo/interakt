// src/features/data-source/external-search/connectors/sitecore-search.request.ts

/**
 * Sitecore Search — request building and response mapping
 *
 * Pure functions between the external-search contract and the Sitecore Search
 * "Search and Recommendation" API (POST /discover/v2/{domainId}). Free of I/O so
 * the translation is unit-testable on its own.
 *
 * Request shape (one widget item per call):
 *   { context, widget: { items: [{ rfk_id, entity, search: {
 *       content, query: { keyphrase }, limit, offset, facet, filter, sort } }] } }
 *
 * Response shape:
 *   { widgets: [{ rfk_id, total_item, content: [...], facet: [{ name, label, value: [{ id, text, count }] }] }] }
 */

import type { FilterClause, SortClause, RangeValue } from '@/features/search/search.types';
import type {
  ExternalConnection,
  ExternalFacet,
  ExternalFacetRequest,
  ExternalSearchHit,
  UnappliedClause,
} from '../external-search.types';

// ============================================================================
// SETTINGS
// ============================================================================

export interface SitecoreSearchSettings {
  /** Full discover URL, e.g. https://discover.sitecorecloud.io/discover/v2/<domainId> */
  endpoint: string;
  /** Widget id configured in Sitecore (e.g. rfk_global_search) */
  rfkId: string;
  /** Entity to search (Sitecore default: content) */
  entity: string;
  /** Page URI reported in the request context */
  pageUri: string;
  /** Optional locale for multi-locale domains */
  locale?: { country: string; language: string };
  /** Filters ANDed into every request (e.g. environment = prod) */
  fixedFilters: FilterClause[];
}

/**
 * Read Sitecore settings from a resolved connection: the connection URL is the
 * discover endpoint, the index name is the widget id, and the rest comes from
 * providerSettings.
 */
export function sitecoreSettings(connection: ExternalConnection): SitecoreSearchSettings {
  const s = connection.providerSettings ?? {};
  const locale = s.locale as { country?: unknown; language?: unknown } | undefined;

  return {
    endpoint: connection.endpoint,
    rfkId: connection.indexName,
    entity: typeof s.entity === 'string' && s.entity ? s.entity : 'content',
    pageUri: typeof s.pageUri === 'string' && s.pageUri ? s.pageUri : '/search',
    locale: locale && typeof locale.country === 'string' && typeof locale.language === 'string'
      ? { country: locale.country, language: locale.language }
      : undefined,
    fixedFilters: Array.isArray(s.fixedFilters) ? (s.fixedFilters as FilterClause[]) : [],
  };
}

// ============================================================================
// FILTERS
// ============================================================================

export type SitecoreFilter =
  | { type: 'eq' | 'gt' | 'gte' | 'lt' | 'lte'; name: string; value: unknown }
  | { type: 'anyOf' | 'allOf'; name: string; values: unknown[] }
  | { type: 'and' | 'or'; filters: SitecoreFilter[] }
  | { type: 'not'; filter: SitecoreFilter };

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

/** Thrown inside translation; turned into an unapplied clause by the caller. */
class UnsupportedFilter extends Error {
  constructor(readonly clause: FilterClause) {
    super(`Sitecore Search has no '${clause.operator}' filter`);
  }
}

/**
 * Translate one filter clause into a Sitecore filter.
 *
 * @throws UnsupportedFilter for operators Sitecore cannot express
 */
export function translateFilter(clause: FilterClause): SitecoreFilter {
  const { field, operator, value } = clause;

  switch (operator) {
    case 'eq':
      return { type: 'eq', name: field, value };
    case 'neq':
      return { type: 'not', filter: { type: 'eq', name: field, value } };
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return { type: operator, name: field, value };
    case 'in':
      return { type: 'anyOf', name: field, values: asArray(value) };
    case 'nin':
      return { type: 'not', filter: { type: 'anyOf', name: field, values: asArray(value) } };
    case 'range': {
      const range = (value ?? {}) as RangeValue;
      const bounds: SitecoreFilter[] = [];
      if (range.from !== undefined) {
        bounds.push({ type: range.includeLower === false ? 'gt' : 'gte', name: field, value: range.from });
      }
      if (range.to !== undefined) {
        bounds.push({ type: range.includeUpper === false ? 'lt' : 'lte', name: field, value: range.to });
      }
      if (bounds.length === 0) throw new UnsupportedFilter(clause);
      return bounds.length === 1 ? bounds[0] : { type: 'and', filters: bounds };
    }
    case 'and':
    case 'or':
      return { type: operator, filters: (clause.filters ?? []).map(translateFilter) };
    case 'not': {
      const inner = (clause.filters ?? []).map(translateFilter);
      if (inner.length === 0) throw new UnsupportedFilter(clause);
      return { type: 'not', filter: inner.length === 1 ? inner[0] : { type: 'and', filters: inner } };
    }
    default:
      // contains, prefix, exists, missing: no Sitecore equivalent
      throw new UnsupportedFilter(clause);
  }
}

/**
 * Combine the fixed filters with the requested ones into one AND. Clauses Sitecore
 * cannot express are reported as unapplied rather than failing the search, the same
 * way the other external connectors behave.
 */
export function buildFilter(
  fixed: FilterClause[],
  requested: FilterClause[] | undefined,
): { filter?: SitecoreFilter; unapplied: UnappliedClause[] } {
  const translated: SitecoreFilter[] = fixed.map(translateFilter);
  const unapplied: UnappliedClause[] = [];

  for (const clause of requested ?? []) {
    try {
      translated.push(translateFilter(clause));
    } catch (error) {
      if (!(error instanceof UnsupportedFilter)) throw error;
      unapplied.push({ field: clause.field, operator: clause.operator, reason: error.message });
    }
  }

  return {
    filter: translated.length > 0 ? { type: 'and', filters: translated } : undefined,
    unapplied,
  };
}

// ============================================================================
// FACETS & SORT
// ============================================================================

export function buildFacet(
  facets: ExternalFacetRequest[] | undefined,
): { types: Array<{ name: string; max?: number }> } | undefined {
  if (!facets || facets.length === 0) return undefined;
  return {
    types: facets.map((f) => (f.size ? { name: f.field, max: f.size } : { name: f.field })),
  };
}

/**
 * Map sort clauses to Sitecore sort options. `_score` means relevance, which is
 * Sitecore's default order, so it is dropped rather than sent.
 */
export function buildSort(
  sort: SortClause[] | undefined,
): { value: Array<{ name: string; order: 'asc' | 'desc' }> } | undefined {
  const value = (sort ?? [])
    .filter((s) => s.field !== '_score')
    .map((s) => ({ name: s.field, order: s.direction }));
  return value.length > 0 ? { value } : undefined;
}

// ============================================================================
// REQUEST
// ============================================================================

export interface SitecoreRequestInput {
  query?: string;
  offset: number;
  limit: number;
  filters?: FilterClause[];
  facets?: ExternalFacetRequest[];
  sort?: SortClause[];
  /** Sitecore content attributes to return (all when omitted) */
  fields?: string[];
}

/** Empty or '*' means "match everything". */
export function isMatchAll(query: string | undefined): boolean {
  const q = (query ?? '').trim();
  return q === '' || q === '*';
}

export function buildSitecoreRequest(
  settings: SitecoreSearchSettings,
  input: SitecoreRequestInput,
  userId: string,
): { body: Record<string, unknown>; unapplied: UnappliedClause[] } {
  const search: Record<string, unknown> = {
    content: input.fields && input.fields.length > 0 ? { fields: input.fields } : {},
    limit: input.limit,
    offset: input.offset,
  };

  if (!isMatchAll(input.query)) {
    search.query = { keyphrase: input.query!.trim() };
  }

  const facet = buildFacet(input.facets);
  if (facet) search.facet = facet;

  const { filter, unapplied } = buildFilter(settings.fixedFilters, input.filters);
  if (filter) search.filter = filter;

  const sort = buildSort(input.sort);
  if (sort) search.sort = sort;

  const context: Record<string, unknown> = {
    page: { uri: settings.pageUri },
    user: { uuid: userId },
  };
  if (settings.locale) context.locale = settings.locale;

  return {
    body: {
      context,
      widget: {
        items: [{ rfk_id: settings.rfkId, entity: settings.entity, search }],
      },
    },
    unapplied,
  };
}

// ============================================================================
// RESPONSE
// ============================================================================

interface SitecoreFacetValue {
  id?: string;
  text?: unknown;
  count?: number;
}

interface SitecoreWidget {
  rfk_id?: string;
  total_item?: number;
  content?: Array<Record<string, unknown>>;
  facet?: Array<{ name: string; label?: string; value?: SitecoreFacetValue[] }>;
}

export interface MappedSitecoreResponse {
  hits: ExternalSearchHit[];
  total: number;
  facets?: ExternalFacet[];
}

/**
 * Pick the widget out of a Sitecore response and map it.
 *
 * Sitecore returns items in ranked order but no relevance score, so the score is
 * derived from the absolute rank (1, 1/2, 1/3, …). That keeps ordering stable
 * across pages and when results are merged with other sources.
 *
 * @throws Error when Sitecore reports errors or the widget is missing
 */
export function mapSitecoreResponse(body: unknown, rfkId: string, offset: number): MappedSitecoreResponse {
  const data = (body ?? {}) as { widgets?: SitecoreWidget[]; errors?: Array<{ message?: string }> };

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const detail = data.errors.map((e) => e?.message).filter(Boolean).join('; ');
    throw new Error(`Sitecore Search returned errors${detail ? `: ${detail}` : ''}`);
  }

  const widgets = data.widgets ?? [];
  const widget = widgets.find((w) => w.rfk_id === rfkId) ?? (widgets.length === 1 ? widgets[0] : undefined);
  if (!widget) {
    throw new Error(`Sitecore Search response has no widget '${rfkId}'`);
  }

  const hits: ExternalSearchHit[] = (widget.content ?? []).map((item, i) => ({
    id: String(item.id ?? `${offset + i}`),
    score: 1 / (offset + i + 1),
    source: item,
  }));

  const facets = widget.facet?.length
    ? widget.facet.map((f) => ({
        field: f.name,
        buckets: (f.value ?? []).map((v) => ({ key: String(v.text ?? ''), count: v.count ?? 0 })),
      }))
    : undefined;

  return { hits, total: widget.total_item ?? hits.length, facets };
}
