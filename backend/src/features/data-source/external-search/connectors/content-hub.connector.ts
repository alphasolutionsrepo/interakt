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
  countEntities,
  contentHubSettings,
  definitionFilter,
  getEntityDefinition,
  renditionHref,
  searchAfter,
  type ContentHubEntity,
  type ContentHubFilter,
  type ContentHubSettings,
} from './content-hub.client';
import {
  cached,
  listOptionValues,
  listTaxonomyItems,
  publicPreviewUrls,
  relatedPreviewUrls,
  resolveDetailPath,
  resolveLazyRelations,
  resolveOptionIdentifiers,
  resolveRelationIds,
} from './content-hub.lookups';
import {
  contentHubFixedFilters,
  fieldKind,
  fullTextFilter,
  queryWords,
  rankByWords,
  rankingProperties,
  translateContentHubFilters,
  translateContentHubSort,
  type ContentHubResolver,
} from './content-hub.request';
import {
  CONTENT_HUB_IMAGE_FIELD,
  CONTENT_HUB_URL_FIELD,
  flattenContentHubEntity,
  inferContentHubFields,
  portalUrl,
} from './content-hub.schema';

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
 * The most count requests one search spends on facet values, and how many run at once.
 * Content Hub has no aggregation, so a value is counted by its own filtered count. One
 * facet (the enumerate tool's case) is always counted: its values are capped at the
 * taxonomy listing size. A search experience asking for many facets at once gets them
 * listed without counts rather than hundreds of requests per search.
 */
const FACET_COUNT_BUDGET = 100;
const FACET_COUNT_CONCURRENCY = 10;

/**
 * Facet values for a field: a taxonomy's items for a relation, an option list's values
 * for an option-list property, each counted within `scope` (the filter the results came
 * from) while the budget allows. Counted values come back largest first without the
 * empty ones; listed-only values keep their order with a count of 1.
 */
async function facetFor(
  settings: ContentHubSettings,
  request: ExternalFacetRequest,
  fields: Map<string, DataSourceField>,
  scope: ContentHubFilter,
  budget: { left: number },
): Promise<ExternalFacet | undefined> {
  const kind = fieldKind(fields.get(request.field), request.field);
  const size = request.size ?? 50;
  let values: Array<{ key: string; filter: ContentHubFilter }>;
  if (kind.kind === 'relation') {
    const items = await listTaxonomyItems(settings, kind.target);
    values = items.map((i) => ({ key: i.label, filter: { type: 'Relation', relation: request.field, id: i.id } }));
  } else if (kind.kind === 'optionList') {
    const options = await listOptionValues(settings, kind.list);
    values = options.map((o) => ({ key: o.label, filter: { type: 'StringProperty', property_name: request.field, operator: 'Equals', value: o.identifier } }));
  } else {
    return undefined;
  }

  if (values.length > budget.left) {
    return { field: request.field, buckets: values.slice(0, size).map((v) => ({ key: v.key, count: 1 })) };
  }
  budget.left -= values.length;
  // Counts change slowly; a repeated enumeration within the cache's lifetime costs nothing
  const buckets = await cached(`${settings.host}\0facet\0${request.field}\0${JSON.stringify(scope)}`, async () => {
    const counts: number[] = [];
    for (let i = 0; i < values.length; i += FACET_COUNT_CONCURRENCY) {
      const chunk = values.slice(i, i + FACET_COUNT_CONCURRENCY);
      counts.push(...await Promise.all(chunk.map((v) => countEntities(settings, andFilters(scope, v.filter)!))));
    }
    return values
      .map((v, i) => ({ key: v.key, count: counts[i] }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.count - a.count);
  });
  return { field: request.field, buckets: buckets.slice(0, size) };
}

/**
 * The portal link and preview image of each hit, as `url` and `image_url`. Images come from
 * the entity's own public links when its definition has them (assets), or from the asset
 * its image relation points at (a product's master asset). Skipped when the source's
 * schema does not carry the field, so a source that hides images pays no requests for them.
 */
async function enrichments(settings: ContentHubSettings, entities: ContentHubEntity[], fields?: DataSourceField[]): Promise<Map<number, Record<string, string>>> {
  const result = new Map<number, Record<string, string>>();
  if (entities.length === 0) return result;
  const names = new Set((fields ?? []).map((f) => f.name));
  const wantUrl = !fields || names.has(CONTENT_HUB_URL_FIELD.name);
  const wantImage = !fields || names.has(CONTENT_HUB_IMAGE_FIELD.name);

  const [path, images] = await Promise.all([
    wantUrl ? resolveDetailPath(settings).catch(() => undefined) : Promise.resolve(undefined),
    wantImage
      ? (settings.imageRelation
        ? relatedPreviewUrls(settings, settings.imageRelation, entities)
        : publicPreviewUrls(settings, entities)).catch(() => new Map<number, string>())
      : Promise.resolve(new Map<number, string>()),
  ]);
  for (const entity of entities) {
    const extra: Record<string, string> = {};
    if (path) extra[CONTENT_HUB_URL_FIELD.name] = portalUrl(settings.host, settings.culture, path, entity.id);
    // A public link is permanent; the signed preview link expires in hours but exists for
    // every asset with a rendition, so it covers the ones no public link was made for
    const image = images.get(entity.id) ?? (wantImage && !settings.imageRelation ? renditionHref(entity, PREVIEW_RENDITION) : undefined);
    if (image) extra[CONTENT_HUB_IMAGE_FIELD.name] = image;
    result.set(entity.id, extra);
  }
  return result;
}

/** The rendition used as an entity's picture. */
const PREVIEW_RENDITION = 'preview';

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
    const wantImage = !fields || fields.some((f) => f.name === CONTENT_HUB_IMAGE_FIELD.name);
    const load = {
      properties: request.selectFields?.length ? request.selectFields : 'all' as const,
      relations: 'all' as const,
      cultures: [settings.culture],
      // The preview as a signed link: the image when the asset has no public link
      renditions: wantImage && !settings.imageRelation ? [PREVIEW_RENDITION] : undefined,
    };
    const run = (filter: ContentHubFilter) => searchAfter(settings, { filter, take, sorting: sort.sorting, ...load });

    const withText = andFilters(base, fullTextFilter(words))!;
    let scope = withText;
    let page: Awaited<ReturnType<typeof run>>;
    let entities: ContentHubEntity[];

    if (words.length > 0 && !request.sort?.length) {
      // Content Hub does not score, so a text search is ranked here: the text of up to a
      // full page of matches is read first (cheap: a few properties, no relations), ordered
      // by how the words appear in it, and only the entities on the requested page are then
      // loaded in full. An explicit sort is honoured as given instead.
      const ranking = rankingProperties(fields);
      page = await searchAfter(settings, {
        filter: withText,
        take: CONTENT_HUB_MAX_TAKE,
        sorting: sort.sorting,
        properties: ranking.length > 0 ? ranking : 'all',
        relations: 'none',
        cultures: [settings.culture],
      });
      const ordered = rankByWords(page.items, (entity) => flattenContentHubEntity(entity, settings.culture), words, fields);
      const ids = ordered.slice(request.offset, request.offset + request.limit).map((entity) => entity.id);
      if (ids.length > 0) {
        const full = await searchAfter(settings, { filter: { type: 'IdIn', ids }, take: ids.length, ...load });
        const byId = new Map(full.items.map((entity) => [entity.id, entity]));
        entities = ids.map((id) => byId.get(id)).filter((entity): entity is ContentHubEntity => entity !== undefined);
        page = { ...page, took: page.took + full.took };
      } else {
        entities = [];
      }
    } else {
      page = await run(withText);
      entities = page.items.slice(request.offset, request.offset + request.limit);
    }

    // Text and filters together first. When that finds nothing and both were given, the
    // filters alone decide: the planner's query text often restates the filters in words the
    // entities never contain ("Brandco products Retired"), and an empty answer for a filter
    // that matches thousands of entities would be wrong.
    if (page.total === 0 && words.length > 0 && requested.filter) {
      page = await run(base);
      scope = base;
      entities = page.items.slice(request.offset, request.offset + request.limit);
      if (page.total > 0) {
        unappliedFilters.push({ field: 'query', reason: `the text "${words.join(' ')}" matched none of the entities the filters select; results are the filters alone` });
      }
    }

    const links = await enrichments(settings, entities, fields);
    const hits = entities.map((entity, i) => ({
      id: String(entity.id),
      score: Math.max(0, 1 - (request.offset + i) / Math.max(page.total, 1)),
      source: { ...flattenContentHubEntity(entity, settings.culture), ...links.get(entity.id) },
    }));

    const facets: ExternalFacet[] = [];
    const budget = { left: FACET_COUNT_BUDGET };
    for (const facetRequest of request.facets ?? []) {
      const facet = await facetFor(settings, facetRequest, byName, scope, budget);
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
  return inferContentHubFields(await getEntityDefinition(settings), settings.culture, { imageRelation: settings.imageRelation });
}

/** How many entities of the definition the integration user can see, within the fixed filters. */
export async function countContentHub(connection: ExternalConnection, fields?: DataSourceField[]): Promise<number> {
  const settings = contentHubSettings(connection);
  const page = await searchAfter(settings, { filter: await baseFilter(connection, settings, fields), take: 1 });
  return page.total;
}

/**
 * A sample of entities for field profiling, with every property and relation loaded.
 * One page at most: SearchAfter caps a page at 100. Relations the page did not inline are
 * read separately, which may shorten the sample (see resolveLazyRelations).
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
  const entities = await resolveLazyRelations(settings, page.items, fields);
  return entities.map((entity) => flattenContentHubEntity(entity, settings.culture));
}

export type { ContentHubSettings };
