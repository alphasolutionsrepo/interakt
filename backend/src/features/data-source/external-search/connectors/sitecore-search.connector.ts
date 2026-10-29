// src/features/data-source/external-search/connectors/sitecore-search.connector.ts

/**
 * Sitecore Search connector
 *
 * Queries one Sitecore Search widget. Sitecore owns indexing, ranking and
 * merchandising rules; Interakt only reads. The data source's connection URL is
 * the discover endpoint and its index name is the widget id (rfk_id).
 *
 * Sitecore has no schema API, so discovery samples the widget: the attributes on
 * the returned items become fields, and the widget's facets mark which of them
 * are facetable. Admins refine the result in the schema editor.
 */

import type { DataSourceField } from '@/db/schema/data-sources.schema';
import { inferFieldRole } from '@/shared/utils/field-roles';
import type {
  ExternalConnection,
  ExternalSearchConnector,
  ExternalSearchRequest,
  ExternalSearchResult,
} from '../external-search.types';
import { EXTERNAL_REQUEST_TIMEOUT_MS } from '../external-search.types';
import {
  buildSitecoreRequest,
  mapSitecoreResponse,
  sitecoreSettings,
  type SitecoreFieldTypes,
  type SitecoreRequestInput,
} from './sitecore-search.request';

// ============================================================================
// HTTP
// ============================================================================

interface SitecoreCall {
  json: unknown;
  took: number;
  unapplied: ExternalSearchResult['unappliedFilters'];
}

/**
 * Build and send one discover request.
 *
 * @param facetAll - ask Sitecore for every facet configured on the widget
 * @throws Error with a readable message on network, HTTP or parse failure
 */
async function callSitecore(
  connection: ExternalConnection,
  input: SitecoreRequestInput,
  facetAll = false,
): Promise<SitecoreCall> {
  const settings = sitecoreSettings(connection);
  const { body, unapplied } = buildSitecoreRequest(settings, input, crypto.randomUUID());
  if (facetAll) {
    const item = (body.widget as { items: Array<{ search: Record<string, unknown> }> }).items[0];
    item.search.facet = { all: true };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (connection.authType !== 'none' && connection.apiKey) {
    // Sitecore takes the key as-is; a bearer token (from its token endpoint) gets the prefix.
    headers.Authorization = connection.authType === 'bearer' ? `Bearer ${connection.apiKey}` : connection.apiKey;
  }

  const start = Date.now();

  // One timeout for the whole exchange, reading the body included
  let response: Response;
  let text: string;
  try {
    response = await fetch(settings.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
    });
    text = await response.text();
  } catch (error) {
    throw new Error(
      (error as Error).name === 'TimeoutError'
        ? 'Sitecore Search request timed out'
        : `Network error connecting to Sitecore Search: ${(error as Error).message}`,
    );
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Sitecore Search rejected the request — check the API key');
    }
    throw new Error(`Sitecore Search returned HTTP ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}`);
  }

  try {
    return { json: JSON.parse(text), took: Date.now() - start, unapplied };
  } catch {
    throw new Error('Sitecore Search returned a non-JSON response');
  }
}

// ============================================================================
// CONNECTOR
// ============================================================================

export const sitecoreSearchConnector: ExternalSearchConnector = {
  provider: 'sitecore-search',
  displayName: 'Sitecore Search',
  capabilities: { facets: true, paging: true, sort: true, highlights: false },

  async search(
    connection: ExternalConnection,
    request: ExternalSearchRequest,
    fields?: DataSourceField[],
  ): Promise<ExternalSearchResult> {
    // Sitecore rejects limit 0 ("under minimum allowed value 1"), which a facet-only
    // request (enumerate, facet values) asks for: fetch one item and drop it.
    const call = await callSitecore(connection, {
      query: request.query,
      offset: request.offset,
      limit: Math.max(request.limit, 1),
      filters: request.filters,
      facets: request.facets,
      sort: request.sort,
      fields: request.selectFields,
      fieldTypes: fields ? sitecoreFieldTypes(fields) : undefined,
    });

    const mapped = mapSitecoreResponse(call.json, connection.indexName, request.offset);
    return {
      ...mapped,
      hits: mapped.hits.slice(0, request.limit),
      took: call.took,
      unappliedFilters: call.unapplied,
      unappliedSort: [],
    };
  },
};

// ============================================================================
// DISCOVERY
// ============================================================================

export interface SitecoreSample {
  items: Record<string, unknown>[];
  total: number;
  /** Facets configured on the widget: name → label */
  facets: Map<string, string>;
}

export interface SitecoreSampleOptions {
  /** Leave the fixed filters out: for the connection probe, and discovery's fallback */
  withoutFixedFilters?: boolean;
  /** Known fields: fixed filter values are sent as their type, as in a search */
  fields?: DataSourceField[];
}

/** Fetch a match-all sample with every facet the widget exposes. */
export async function sampleSitecore(
  connection: ExternalConnection,
  limit: number,
  options: SitecoreSampleOptions = {},
): Promise<SitecoreSample> {
  const sampled = options.withoutFixedFilters
    ? { ...connection, providerSettings: { ...connection.providerSettings, fixedFilters: [] } }
    : connection;
  const fieldTypes = options.fields ? sitecoreFieldTypes(options.fields) : undefined;
  const call = await callSitecore(sampled, { offset: 0, limit, fieldTypes }, true);
  const widgets = ((call.json ?? {}) as { widgets?: Array<{ rfk_id?: string; facet?: Array<{ name: string; label?: string }> }> }).widgets ?? [];
  const widget = widgets.find((w) => w.rfk_id === connection.indexName) ?? widgets[0];
  const mapped = mapSitecoreResponse(call.json, connection.indexName, 0);

  return {
    items: mapped.hits.map((h) => h.source),
    total: mapped.total,
    facets: new Map((widget?.facet ?? []).map((f) => [f.name, f.label ?? f.name])),
  };
}

const DISCOVERY_SAMPLE_SIZE = 25;

/**
 * Discover fields from a sample within the source's fixed filters, sent as the known
 * types. Fixed filter values go out as their type only once a sample has seen it, so if
 * Sitecore refuses the scoped sample (a value of the wrong type, on a source not yet
 * discovered), the types are learned from a sample of the whole widget and the scope is
 * sampled again with them. If that still fails, the whole-widget fields are returned so
 * the schema isn't empty; the health check then reports the fixed filters as failing.
 *
 * @param knownFields - the source's stored fields
 */
export async function discoverSitecoreFields(
  connection: ExternalConnection,
  knownFields: DataSourceField[] = [],
): Promise<DataSourceField[]> {
  try {
    return inferSitecoreFields(await sampleSitecore(connection, DISCOVERY_SAMPLE_SIZE, { fields: knownFields }));
  } catch (scopedError) {
    if (sitecoreSettings(connection).fixedFilters.length === 0) throw scopedError;
  }
  const learned = inferSitecoreFields(
    await sampleSitecore(connection, DISCOVERY_SAMPLE_SIZE, { withoutFixedFilters: true }),
  );
  try {
    // Learned types win; a known type this sample didn't see is kept
    const fields = [...knownFields, ...learned];
    return inferSitecoreFields(await sampleSitecore(connection, DISCOVERY_SAMPLE_SIZE, { fields }));
  } catch {
    return learned;
  }
}

function humanize(name: string): string {
  return name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Field name → type, for sending filter values as their attribute's type. Only
 * types seen in sampled values (valueType): Sitecore rejects a value of the wrong
 * type, so a guessed type would break a value that works as sent. Sources sampled
 * before valueType existed send values as given until they are rediscovered.
 */
export function sitecoreFieldTypes(fields: DataSourceField[]): SitecoreFieldTypes {
  return new Map(fields.flatMap((f) => (f.valueType ? [[f.name, f.valueType] as const] : [])));
}

/**
 * Infer fields from sampled items.
 *
 * Prose (titles, descriptions, anything mostly containing spaces) is searchable;
 * ids, URLs and codes are keyword-like. Facet attributes are facetable and filterable. Sortability is unknown
 * (sort options are configured in Sitecore), so it starts off.
 */
export function inferSitecoreFields(sample: SitecoreSample): DataSourceField[] {
  const order: string[] = [];
  const values = new Map<string, unknown[]>();
  for (const item of sample.items) {
    for (const [key, value] of Object.entries(item)) {
      if (!values.has(key)) {
        values.set(key, []);
        order.push(key);
      }
      if (value !== null && value !== undefined && value !== '') values.get(key)!.push(value);
    }
  }
  // Facets the sample didn't happen to carry are still real attributes.
  for (const name of sample.facets.keys()) {
    if (!values.has(name)) {
      values.set(name, []);
      order.push(name);
    }
  }

  return order.map((name) => {
    const seen = values.get(name)!;
    const first = seen[0];
    const isFacet = sample.facets.has(name);
    // A list attribute's type is its items' type
    const item = seen.flatMap((v) => (Array.isArray(v) ? v : [v])).find((v) => v !== null && v !== undefined && v !== '');
    const valueType = typeof item === 'number' ? 'number'
      : typeof item === 'boolean' ? 'boolean'
      : typeof item === 'string' ? 'text'
      : undefined;

    // The field's type (what the chat tool offers: operators, sorting) stays text for a
    // list; only filter values take the items' type
    let type = 'text';
    let providerType = 'string';
    if (Array.isArray(first)) {
      providerType = 'array';
    } else if (typeof first === 'number' || typeof first === 'boolean') {
      type = providerType = typeof first;
    }

    // Prose has spaces; ids and URLs don't, however long they are.
    const strings = seen.filter((v): v is string => typeof v === 'string');
    const prose = strings.filter((v) => /\s/.test(v.trim()));
    const role = inferFieldRole(name) ?? null;
    const isFreeText = type === 'text' && providerType === 'string' && !isFacet
      && role !== 'id' && role !== 'url'
      && (role === 'title' || role === 'description' || (strings.length > 0 && prose.length / strings.length >= 0.5));

    return {
      name,
      displayName: sample.facets.get(name) ?? humanize(name),
      type,
      providerType,
      ...(valueType && { valueType }),
      role,
      isSearchable: isFreeText,
      isFacetable: isFacet,
      isFilterable: isFacet || name === 'id',
      isRetrievable: true,
      isSortable: false,
    };
  });
}
