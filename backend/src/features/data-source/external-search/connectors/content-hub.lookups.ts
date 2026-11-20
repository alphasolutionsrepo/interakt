// src/features/data-source/external-search/connectors/content-hub.lookups.ts

/**
 * Sitecore Content Hub — taxonomy and option-list lookups
 *
 * The values a user names ("Cabinets", "Active", "Brandco") are entity ids and option-list
 * identifiers to Content Hub. These lookups resolve one to the other and list a
 * taxonomy's or option list's values for facets, with a short in-memory cache per tenant:
 * every chat turn would otherwise spend requests of the shared rate budget on the same
 * handful of lists.
 */

import 'server-only';

import {
  contentHubRequest,
  getRelationIds,
  orFilters,
  queryEntitiesV1,
  renditionHref,
  searchAfter,
  type ContentHubEntity,
  type ContentHubFilter,
  type ContentHubSettings,
} from './content-hub.client';
import {
  fileKeysOf,
  flattenContentHubEntity,
  pickDetailPage,
  portalUrl,
  publicLinkUrl,
  PUBLIC_LINK_RELATION,
  type ContentHubPortalPage,
} from './content-hub.schema';

const CACHE_TTL_MS = 10 * 60_000;
/** The most taxonomy items listed for a facet: SearchAfter's page cap. */
const TAXONOMY_LIST_LIMIT = 100;

interface CacheEntry<T> { value: T; expiresAt: number }
const cache = new Map<string, CacheEntry<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt) return Promise.resolve(hit.value as T);
  return load().then((value) => {
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  });
}

/** Forget cached lookups (tests). */
export function resetContentHubLookups(): void {
  cache.clear();
}

export interface ContentHubItem {
  id: number;
  identifier?: string;
  label: string;
}

const LABEL_PROPERTIES = ['TaxonomyLabel', 'Label', 'Name', 'Title', 'StatusValue', 'TaxonomyName', 'ProductFamilyName'];

function itemLabel(record: Record<string, unknown>): string {
  for (const key of LABEL_PROPERTIES) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return String(record.identifier ?? record.id ?? '');
}

async function listDefinition(settings: ContentHubSettings, definition: string, filter?: ContentHubFilter, take = TAXONOMY_LIST_LIMIT): Promise<ContentHubItem[]> {
  const base: ContentHubFilter = { type: 'DefinitionName', name: definition };
  const page = await searchAfter(settings, {
    filter: filter ? { type: 'Logical', operator: 'And', left: base, right: filter } : base,
    take,
    properties: LABEL_PROPERTIES,
    relations: 'none',
    cultures: [settings.culture],
  });
  return page.items.map((entity) => {
    const record = flattenContentHubEntity(entity, settings.culture);
    return { id: entity.id, identifier: entity.identifier, label: itemLabel(record) };
  });
}

/** The items of a taxonomy (or any definition), one page: for facet values. */
export function listTaxonomyItems(settings: ContentHubSettings, definition: string): Promise<ContentHubItem[]> {
  return cached(`${settings.host}\0tax\0${definition}`, () => listDefinition(settings, definition));
}

function sameText(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), undefined, { sensitivity: 'accent' }) === 0;
}

/**
 * Whether a label names `text` with a qualifier appended: "Harbor-275" or "Harbor (CA)" for
 * "Harbor", not "Harbour". Home designs and communities carry such suffixes on this kind of
 * tenant, and a user says the name without it.
 */
function startsWithName(label: string, text: string): boolean {
  const lower = label.trim().toLowerCase();
  const name = text.trim().toLowerCase();
  return lower.startsWith(name) && (lower.length === name.length || !/[\p{L}\p{N}]/u.test(lower[name.length]));
}

/** The most items one name may stand for in a filter: a balanced OR of this many is fine. */
const MAX_IDS_PER_NAME = 50;

/**
 * The ids of a definition's items named `value`: by identifier, else by label. Labels are
 * multilingual, which SearchAfter's string filter cannot match, so candidates come from a
 * full-text search on the definition and are kept on an exact label match, or, when nothing
 * matches exactly, on the label starting with the name. "Cabinets" may name both a parent
 * and a child node and "Harbor" several variants; every matching id comes back.
 */
export function resolveRelationIds(settings: ContentHubSettings, definition: string, value: unknown): Promise<number[]> {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '');
  if (!text) return Promise.resolve([]);
  return cached(`${settings.host}\0rel\0${definition}\0${text.toLowerCase()}`, async () => {
    const candidates = await listDefinition(settings, definition, { type: 'FullText', value: text, operator: 'Equals' }, MAX_IDS_PER_NAME);
    const byIdentifier = candidates.filter((c) => c.identifier === text);
    if (byIdentifier.length) return byIdentifier.map((c) => c.id);
    const exact = candidates.filter((c) => sameText(c.label, text));
    if (exact.length) return exact.map((c) => c.id);
    return candidates.filter((c) => startsWithName(c.label, text)).map((c) => c.id);
  });
}

export interface ContentHubOption {
  identifier: string;
  label: string;
}

/** An option list's values, labels in the connection's culture. */
export function listOptionValues(settings: ContentHubSettings, list: string): Promise<ContentHubOption[]> {
  return cached(`${settings.host}\0opt\0${list}`, async () => {
    const { json } = await contentHubRequest<{ values?: Array<{ identifier: string; labels?: Record<string, string>; values?: unknown[] }> }>(
      settings,
      `/api/datasources/${encodeURIComponent(list)}`,
    );
    const flatten = (items: Array<{ identifier: string; labels?: Record<string, string>; values?: unknown[] }>): ContentHubOption[] =>
      items.flatMap((item) => [
        { identifier: item.identifier, label: item.labels?.[settings.culture] ?? Object.values(item.labels ?? {})[0] ?? item.identifier },
        ...flatten((item.values ?? []) as typeof items),
      ]);
    return flatten(json.values ?? []);
  });
}

// ============================================================================
// PORTAL LINKS
// ============================================================================

/**
 * The portal path of a definition's detail page, from the tenant's own page entities
 * (`Portal.Page` carries the path and the definition it shows). The admin's
 * `deepLinkPath` wins when set. Undefined when the portal has no page for the definition.
 */
export function resolveDetailPath(settings: ContentHubSettings, definition = settings.definition): Promise<string | undefined> {
  if (settings.deepLinkPath) return Promise.resolve(settings.deepLinkPath);
  return cached(`${settings.host}\0page\0${definition}`, async () => {
    const page = await searchAfter(settings, {
      filter: { type: 'Logical', operator: 'And', left: { type: 'DefinitionName', name: 'Portal.Page' }, right: { type: 'StringProperty', property_name: 'Page.Definition', operator: 'Equals', value: definition } },
      take: 100,
      properties: ['Page.Path', 'Page.Definition', 'Page.RouteName', 'Page.IsVisible', 'Page.IsTemplate'],
      relations: 'none',
      // Page.Path is multilingual: without a culture it comes back empty
      cultures: [settings.culture],
    });
    const pages: ContentHubPortalPage[] = page.items.map((e) => {
      const p = flattenContentHubEntity(e, settings.culture);
      return {
        identifier: e.identifier,
        path: typeof p['Page.Path'] === 'string' ? p['Page.Path'] : undefined,
        definition: typeof p['Page.Definition'] === 'string' ? p['Page.Definition'] : undefined,
        route: typeof p['Page.RouteName'] === 'string' ? p['Page.RouteName'] : undefined,
        visible: typeof p['Page.IsVisible'] === 'boolean' ? p['Page.IsVisible'] : undefined,
        template: typeof p['Page.IsTemplate'] === 'boolean' ? p['Page.IsTemplate'] : undefined,
      };
    });
    return pickDetailPage(pages, definition)?.path;
  });
}

/** The portal URL of an entity of the source's definition, when the portal has a page for it. */
export async function entityUrl(settings: ContentHubSettings, id: number): Promise<string | undefined> {
  const path = await resolveDetailPath(settings);
  return path ? portalUrl(settings.host, settings.culture, path, id) : undefined;
}

// ============================================================================
// PUBLIC LINKS (IMAGES)
// ============================================================================

/**
 * Public preview URLs for a batch of assets, by asset id. One V1 query lists the links of
 * up to a page of assets; each link is matched to its asset by storage key, since the
 * link's own relation to the asset is never returned by search. Preview links win over
 * originals. Results are cached per asset.
 */
export async function publicPreviewUrls(settings: ContentHubSettings, assets: ContentHubEntity[]): Promise<Map<number, string>> {
  const urls = new Map<number, string>();
  const pending: ContentHubEntity[] = [];
  for (const asset of assets) {
    const hit = cache.get(`${settings.host}\0link\0${asset.id}`);
    if (hit && Date.now() < hit.expiresAt) {
      if (hit.value) urls.set(asset.id, hit.value as string);
    } else {
      pending.push(asset);
    }
  }
  if (pending.length === 0) return urls;

  const keyToAsset = new Map<string, { id: number; preview: boolean }>();
  for (const asset of pending) {
    const keys = fileKeysOf(asset);
    if (keys.preview) keyToAsset.set(keys.preview, { id: asset.id, preview: true });
    if (keys.original) keyToAsset.set(keys.original, { id: asset.id, preview: false });
  }
  const query = `Definition.Name=='M.PublicLink' AND (${pending.map((a) => `Parent('${PUBLIC_LINK_RELATION}').id==${a.id}`).join(' OR ')})`;
  const { items } = await queryEntitiesV1(settings, query, { take: 100, members: ['FileKey', 'RelativeUrl', 'VersionHash', 'Status', 'Resource'] });

  const found = new Map<number, { url: string; preview: boolean }>();
  for (const link of items) {
    const p = link.properties ?? {};
    if (p.Status !== 'Completed' || typeof p.RelativeUrl !== 'string' || typeof p.FileKey !== 'string') continue;
    const owner = keyToAsset.get(p.FileKey);
    if (!owner) continue;
    const current = found.get(owner.id);
    if (!current || (owner.preview && !current.preview)) {
      found.set(owner.id, { url: publicLinkUrl(settings.host, p.RelativeUrl, typeof p.VersionHash === 'string' ? p.VersionHash : undefined), preview: owner.preview });
    }
  }
  for (const asset of pending) {
    const url = found.get(asset.id)?.url;
    cache.set(`${settings.host}\0link\0${asset.id}`, { value: url ?? null, expiresAt: Date.now() + CACHE_TTL_MS });
    if (url) urls.set(asset.id, url);
  }
  return urls;
}

/**
 * Preview URLs for entities whose image is a related asset (a product's master asset): the
 * relation is read per entity (search never inlines it), then the assets' public links are
 * fetched in one batch. Cached per entity.
 */
export async function relatedPreviewUrls(settings: ContentHubSettings, relation: string, entities: ContentHubEntity[]): Promise<Map<number, string>> {
  const urls = new Map<number, string>();
  const pending: ContentHubEntity[] = [];
  for (const entity of entities) {
    const hit = cache.get(`${settings.host}\0rel-link\0${relation}\0${entity.id}`);
    if (hit && Date.now() < hit.expiresAt) {
      if (hit.value) urls.set(entity.id, hit.value as string);
    } else {
      pending.push(entity);
    }
  }
  if (pending.length === 0) return urls;

  const assetIdOf = new Map<number, number>();
  await Promise.all(pending.map(async (entity) => {
    try {
      const [assetId] = await getRelationIds(settings, entity.id, relation);
      if (assetId) assetIdOf.set(entity.id, assetId);
    } catch {
      // No image is a normal state; a failed relation read must not fail the search
    }
  }));
  const assetIds = [...new Set(assetIdOf.values())];
  let assets: ContentHubEntity[] = [];
  if (assetIds.length) {
    const page = await searchAfter(settings, {
      filter: orFilters([{ type: 'IdIn', ids: assetIds }])!,
      take: 100,
      properties: ['Renditions', 'MainFile'],
      relations: 'none',
      renditions: ['preview'],
    });
    assets = page.items;
  }
  const previews = assets.length ? await publicPreviewUrls(settings, assets) : new Map<number, string>();
  const signed = new Map(assets.map((a) => [a.id, renditionHref(a, 'preview')]));
  for (const entity of pending) {
    const assetId = assetIdOf.get(entity.id);
    const url = assetId ? previews.get(assetId) ?? signed.get(assetId) : undefined;
    cache.set(`${settings.host}\0rel-link\0${relation}\0${entity.id}`, { value: url ?? null, expiresAt: Date.now() + CACHE_TTL_MS });
    if (url) urls.set(entity.id, url);
  }
  return urls;
}

/** The identifiers an option-list value named `value` stands for: by identifier, else by label. */
export async function resolveOptionIdentifiers(settings: ContentHubSettings, list: string, value: unknown): Promise<string[]> {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '');
  if (!text) return [];
  const options = await listOptionValues(settings, list);
  if (options.some((o) => o.identifier === text)) return [text];
  return options.filter((o) => sameText(o.label, text)).map((o) => o.identifier);
}
