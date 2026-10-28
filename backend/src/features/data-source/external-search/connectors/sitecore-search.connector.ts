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

/** Fetch a match-all sample with every facet the widget exposes. */
export async function sampleSitecore(connection: ExternalConnection, limit: number): Promise<SitecoreSample> {
  const call = await callSitecore(connection, { offset: 0, limit }, true);
  const widgets = ((call.json ?? {}) as { widgets?: Array<{ rfk_id?: string; facet?: Array<{ name: string; label?: string }> }> }).widgets ?? [];
  const widget = widgets.find((w) => w.rfk_id === connection.indexName) ?? widgets[0];
  const mapped = mapSitecoreResponse(call.json, connection.indexName, 0);

  return {
    items: mapped.hits.map((h) => h.source),
    total: mapped.total,
    facets: new Map((widget?.facet ?? []).map((f) => [f.name, f.label ?? f.name])),
  };
}

function humanize(name: string): string {
  return name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** providerType of an attribute the sample carried no value for, so its type is a guess */
const UNSAMPLED = 'unsampled';

/**
 * Field name → type, for sending filter values as their attribute's type. Only
 * types seen in a sampled value: Sitecore rejects a value of the wrong type, so a
 * guessed type would break a value that works as sent.
 */
export function sitecoreFieldTypes(fields: DataSourceField[]): SitecoreFieldTypes {
  return new Map(fields.filter((f) => f.providerType !== UNSAMPLED).map((f) => [f.name, f.type]));
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
    const item = Array.isArray(first) ? first.find((v) => v !== null && v !== undefined && v !== '') : first;

    let type = 'text';
    let providerType = 'string';
    if (typeof item === 'number') {
      type = 'number';
    } else if (typeof item === 'boolean') {
      type = 'boolean';
    }
    if (item === undefined) {
      providerType = UNSAMPLED;
    } else if (Array.isArray(first)) {
      providerType = 'array';
    } else if (type !== 'text') {
      providerType = type;
    }

    // Prose has spaces; ids and URLs don't, however long they are.
    const strings = seen.filter((v): v is string => typeof v === 'string');
    const prose = strings.filter((v) => /\s/.test(v.trim()));
    const role = inferFieldRole(name) ?? null;
    const isFreeText = type === 'text' && !Array.isArray(first) && !isFacet
      && role !== 'id' && role !== 'url'
      && (role === 'title' || role === 'description' || (strings.length > 0 && prose.length / strings.length >= 0.5));

    return {
      name,
      displayName: sample.facets.get(name) ?? humanize(name),
      type,
      providerType,
      role,
      isSearchable: isFreeText,
      isFacetable: isFacet,
      isFilterable: isFacet || name === 'id',
      isRetrievable: true,
      isSortable: false,
    };
  });
}
