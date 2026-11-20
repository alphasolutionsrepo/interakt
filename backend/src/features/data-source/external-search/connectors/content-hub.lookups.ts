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
  searchAfter,
  type ContentHubFilter,
  type ContentHubSettings,
} from './content-hub.client';
import { flattenContentHubEntity } from './content-hub.schema';

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

/** The identifiers an option-list value named `value` stands for: by identifier, else by label. */
export async function resolveOptionIdentifiers(settings: ContentHubSettings, list: string, value: unknown): Promise<string[]> {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '');
  if (!text) return [];
  const options = await listOptionValues(settings, list);
  if (options.some((o) => o.identifier === text)) return [text];
  return options.filter((o) => sameText(o.label, text)).map((o) => o.identifier);
}
