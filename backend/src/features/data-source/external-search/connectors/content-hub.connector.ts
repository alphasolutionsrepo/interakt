// src/features/data-source/external-search/connectors/content-hub.connector.ts

/**
 * Sitecore Content Hub connector
 *
 * Queries one entity definition (assets, products, a custom definition) of a Content Hub
 * tenant live, through the SearchAfter V2 API. Content Hub owns the data, its index and
 * its permissions: the integration user the OAuth client is bound to sees exactly what it
 * is allowed to, and so does Interakt.
 *
 * Discovery reads the entity definition itself, so the schema is authoritative. A sample
 * of entities then profiles the values. Searches combine the source's fixed filters, the
 * request's filters (relations resolved by name through the tenant's taxonomies) and full
 * text; facets list taxonomy items and option-list values.
 */

import 'server-only';


import type {
  ExternalConnection,
  ExternalFacet,
  ExternalFacetRequest,
  ExternalSearchConnector,
  ExternalSearchRequest,
  ExternalSearchResult,
} from '../external-search.types';

import {
  CONTENT_HUB,
  CONTENT_HUB_MAX_TAKE,
  andFilters,
  contentHubSettings,
  definitionFilter,
  getEntityDefinition,
  searchAfter,
  type ContentHubFilter,
  type ContentHubSettings,
} from './content-hub.client';
import { listOptionValues, listTaxonomyItems, resolveOptionIdentifiers, resolveRelationIds } from './content-hub.lookups';
import {
  contentHubFixedFilters,
  fieldKind,
  fullTextFilter,
  queryWords,
  translateContentHubFilters,
  translateContentHubSort,
  type ContentHubResolver,
} from './content-hub.request';
import { flattenContentHubEntity, inferContentHubFields } from './content-hub.schema';

import type { DataSourceField } from '@/db/schema/data-sources.schema';

// ============================================================================
// CONNECTOR
// ============================================================================

function resolverFor(settings: ContentHubSettings): ContentHubResolver {
  return {
    relationIds: (target, value) => resolveRelationIds(settings, target, value),
    optionIdentifiers: (list, value) => resolveOptionIdentifiers(settings, list, value),
  };
}

/**
 * The filter every query on the source starts from: its definition and its fixed filters.
 * A fixed filter that cannot be translated is a configuration error and fails the query
 * rather than silently widening it.
 */
async function baseFilter(connection: ExternalConnection, settings: ContentHubSettings, fields?: DataSourceField[]): Promise<ContentHubFilter> {
  const fixed = await translateContentHubFilters(contentHubFixedFilters(connection), fields, resolverFor(settings));
  if (fixed.unapplied.length) {
    throw new Error(`Content Hub fixed filter cannot be applied: ${fixed.unapplied.map((u) => `${u.field}: ${u.reason}`).join('; ')}`);
  }
  return andFilters(definitionFilter(settings), fixed.filter)!;
}

/**
 * Facet values for a field: a taxonomy's items for a relation, an option list's values
 * for an option-list property. Counts are not available from Content Hub; each value is
 * reported once so enumeration still lists what can be filtered on.
 */
async function facetFor(settings: ContentHubSettings, request: ExternalFacetRequest, fields: Map<string, DataSourceField>): Promise<ExternalFacet | undefined> {
  const kind = fieldKind(fields.get(request.field), request.field);
  const size = request.size ?? 50;
  if (kind.kind === 'relation') {
    const items = await listTaxonomyItems(settings, kind.target);
    return { field: request.field, buckets: items.slice(0, size).map((i) => ({ key: i.label, count: 1 })) };
  }
  if (kind.kind === 'optionList') {
    const options = await listOptionValues(settings, kind.list);
    return { field: request.field, buckets: options.slice(0, size).map((o) => ({ key: o.label, count: 1 })) };
  }
  return undefined;
}

export const contentHubConnector: ExternalSearchConnector = {
  provider: 'content-hub',
  displayName: CONTENT_HUB,
  capabilities: { facets: true, paging: true, sort: true, highlights: false, documentIdField: 'id' },

  async search(
    connection: ExternalConnection,
    request: ExternalSearchRequest,
    fields?: DataSourceField[],
  ): Promise<ExternalSearchResult> {
    const settings = contentHubSettings(connection);
    const byName = new Map((fields ?? []).map((f) => [f.name, f]));
    const resolver = resolverFor(settings);

    const words = queryWords(request.query, [settings.definition]);
    const requested = await translateContentHubFilters(request.filters, fields, resolver);
    const base = andFilters(await baseFilter(connection, settings, fields), requested.filter)!;
    const sort = translateContentHubSort(request.sort, fields);
    const unappliedFilters = [...requested.unapplied];

    // SearchAfter pages by cursor, not offset: a later page is fetched by over-reading from
    // the start, bounded by the largest page the API allows.
    const take = Math.min(request.offset + request.limit, CONTENT_HUB_MAX_TAKE);
    const run = (filter: ContentHubFilter) => searchAfter(settings, {
      filter,
      take,
      sorting: sort.sorting,
      properties: request.selectFields?.length ? request.selectFields : 'all',
      relations: 'all',
      cultures: [settings.culture],
    });

    // Text and filters together first. When that finds nothing and both were given, the
    // filters alone decide: the planner's query text often restates the filters in words the
    // entities never contain ("Brandco products Retired"), and an empty answer for a filter
    // that matches thousands of entities would be wrong.
    let page = await run(andFilters(base, fullTextFilter(words))!);
    if (page.total === 0 && words.length > 0 && requested.filter) {
      page = await run(base);
      if (page.total > 0) {
        unappliedFilters.push({ field: 'query', reason: `the text "${words.join(' ')}" matched none of the entities the filters select; results are the filters alone` });
      }
    }

    const hits = page.items.slice(request.offset, request.offset + request.limit).map((entity, i) => ({
      id: String(entity.id),
      score: Math.max(0, 1 - (request.offset + i) / Math.max(page.total, 1)),
      source: flattenContentHubEntity(entity, settings.culture),
    }));

    const facets: ExternalFacet[] = [];
    for (const facetRequest of request.facets ?? []) {
      const facet = await facetFor(settings, facetRequest, byName);
      if (facet) facets.push(facet);
    }

    return {
      hits,
      total: page.total,
      took: page.took,
      ...(request.facets?.length ? { facets } : {}),
      unappliedFilters,
      unappliedSort: sort.unapplied,
    };
  },
};

// ============================================================================
// HEALTH, DISCOVERY, SAMPLING
// ============================================================================

/**
 * Prove the host, the OAuth client, its user and the definition together: reading the
 * definition needs a valid token and read permission on it.
 *
 * @throws ExternalSearchError with a readable message when any of those fails
 */
export async function probeContentHub(connection: ExternalConnection): Promise<{ definition: string; label?: string }> {
  const settings = contentHubSettings(connection);
  const definition = await getEntityDefinition(settings);
  return { definition: definition.name, label: definition.labels?.[settings.culture] };
}

/** The source's fields, from its entity definition. */
export async function discoverContentHubFields(connection: ExternalConnection): Promise<DataSourceField[]> {
  const settings = contentHubSettings(connection);
  return inferContentHubFields(await getEntityDefinition(settings), settings.culture);
}

/** How many entities of the definition the integration user can see, within the fixed filters. */
export async function countContentHub(connection: ExternalConnection, fields?: DataSourceField[]): Promise<number> {
  const settings = contentHubSettings(connection);
  const page = await searchAfter(settings, { filter: await baseFilter(connection, settings, fields), take: 1 });
  return page.total;
}

/**
 * A sample of entities for field profiling, with every property and relation loaded.
 * One page at most: SearchAfter caps a page at 100.
 */
export async function sampleContentHub(connection: ExternalConnection, size: number, fields?: DataSourceField[]): Promise<Record<string, unknown>[]> {
  const settings = contentHubSettings(connection);
  const page = await searchAfter(settings, {
    filter: await baseFilter(connection, settings, fields),
    take: Math.min(size, CONTENT_HUB_MAX_TAKE),
    properties: 'all',
    relations: 'all',
    cultures: [settings.culture],
  });
  return page.items.map((entity) => flattenContentHubEntity(entity, settings.culture));
}

export type { ContentHubSettings };
