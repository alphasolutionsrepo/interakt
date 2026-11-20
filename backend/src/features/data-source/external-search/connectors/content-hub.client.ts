// src/features/data-source/external-search/connectors/content-hub.client.ts

/**
 * Sitecore Content Hub — HTTP client
 *
 * The I/O half of the Content Hub connector: OAuth client-credentials tokens (minted once
 * per host and client id, cached until shortly before they expire), one request helper
 * with the shared external timeout, and the two Content Hub endpoints the connector uses:
 *
 *   GET  /api/entitydefinitions/{name}      the schema of one entity definition
 *   POST /api/entities/searchafter          cursor-paged search with structured filters
 *                                           (header X-ApiVersion: 2)
 *
 * SearchAfter V2 is used for every query. Its structured filters cover definition,
 * relation, string, date and id filters and full text; the older query-string API accepts
 * only equality and parent-by-id, and the V3 query endpoint is not reliably available.
 */

import 'server-only';

import { bodyExcerpt, readResponseBody } from '../engines/response-body';
import type { ExternalConnection } from '../external-search.types';
import { EXTERNAL_REQUEST_TIMEOUT_MS, ExternalSearchError } from '../external-search.types';

import { connectFailure, fetchOnSameServer } from '@/shared/http/same-server-fetch';

export const CONTENT_HUB = 'Content Hub';

/** SearchAfter refuses a page above this. */
export const CONTENT_HUB_MAX_TAKE = 100;

// ============================================================================
// SETTINGS
// ============================================================================

export interface ContentHubSettings {
  /** Tenant host, e.g. https://tenant.sitecorecontenthub.cloud (no trailing slash) */
  host: string;
  /** Entity definition this source searches, e.g. M.Asset */
  definition: string;
  authType: ExternalConnection['authType'];
  /** OAuth client id (client credentials) */
  clientId: string;
  /** The vault secret: the OAuth client secret, or a bearer token */
  secret: string;
  /** Culture multilingual properties are read in */
  culture: string;
  /** Portal path of the entity's detail page, when the admin sets it instead of discovery finding it */
  deepLinkPath?: string;
  /** For entities whose image is a related asset (a product's master asset): the relation to it */
  imageRelation?: string;
}

/**
 * Read Content Hub settings from a resolved connection: the connection URL is the tenant
 * host, the index name is the entity definition, and the rest comes from providerSettings.
 */
export function contentHubSettings(connection: ExternalConnection): ContentHubSettings {
  const s = connection.providerSettings ?? {};
  return {
    host: connection.endpoint.replace(/\/+$/, ''),
    definition: connection.indexName,
    authType: connection.authType,
    clientId: typeof s.clientId === 'string' ? s.clientId.trim() : '',
    secret: connection.apiKey,
    culture: typeof s.culture === 'string' && s.culture.trim() ? s.culture.trim() : 'en-US',
    deepLinkPath: typeof s.deepLinkPath === 'string' && s.deepLinkPath.trim() ? s.deepLinkPath.trim() : undefined,
    imageRelation: typeof s.imageRelation === 'string' && s.imageRelation.trim() ? s.imageRelation.trim() : undefined,
  };
}

// ============================================================================
// TOKENS
// ============================================================================

interface CachedToken {
  value: string;
  expiresAt: number;
}

/** Tokens live for an hour; refresh this long before that so a request never carries a stale one. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

const tokens = new Map<string, CachedToken>();
const pendingTokens = new Map<string, Promise<string>>();

function tokenKey(settings: ContentHubSettings): string {
  return `${settings.host}\0${settings.clientId}`;
}

/** Forget cached tokens (tests, or after a 401). */
export function resetContentHubTokens(): void {
  tokens.clear();
  pendingTokens.clear();
}

/**
 * The bearer token for a connection: the secret itself for `bearer`, else a token minted
 * with the client-credentials grant and cached per host and client id. Concurrent callers
 * share one mint.
 *
 * @throws ExternalSearchError when the token endpoint refuses the client
 */
export async function getContentHubToken(settings: ContentHubSettings): Promise<string> {
  if (settings.authType === 'bearer') return settings.secret;
  if (settings.authType !== 'oauth_client_credentials') {
    throw new ExternalSearchError(CONTENT_HUB, 'Content Hub needs OAuth client credentials or a bearer token');
  }
  if (!settings.clientId) {
    throw new ExternalSearchError(CONTENT_HUB, 'Content Hub client id is missing (providerSettings.clientId)');
  }

  const key = tokenKey(settings);
  const cached = tokens.get(key);
  if (cached && Date.now() < cached.expiresAt - TOKEN_REFRESH_MARGIN_MS) return cached.value;

  let pending = pendingTokens.get(key);
  if (!pending) {
    pending = mintToken(settings).finally(() => pendingTokens.delete(key));
    pendingTokens.set(key, pending);
  }
  return pending;
}

async function mintToken(settings: ContentHubSettings): Promise<string> {
  let response: Response;
  let answer: Awaited<ReturnType<typeof readResponseBody>>;
  try {
    response = await fetchOnSameServer(`${settings.host}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: settings.clientId,
        client_secret: settings.secret,
      }).toString(),
      signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
    });
    answer = await readResponseBody(response);
  } catch (error) {
    throw new ExternalSearchError(
      CONTENT_HUB,
      (error as Error).name === 'TimeoutError' ? 'Content Hub token request timed out' : connectFailure(CONTENT_HUB, error),
    );
  }

  const json = answer.json as { access_token?: string; expires_in?: number } | undefined;
  if (!response.ok || !json?.access_token) {
    throw new ExternalSearchError(
      CONTENT_HUB,
      response.status === 400 || response.status === 401
        ? 'Content Hub rejected the OAuth client — check the client id and secret, and that the client allows the client credentials grant'
        : `Content Hub token request failed with HTTP ${response.status}${bodyExcerpt(answer.text)}`,
      response.status,
    );
  }

  tokens.set(tokenKey(settings), {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  });
  return json.access_token;
}

// ============================================================================
// THROTTLE
// ============================================================================

/**
 * Content Hub allows about 15 requests per second per API user and answers 429 above that.
 * Parameter grounding enumerates many facets at once, so requests to one host are held to a
 * small number in flight, and a 429 is retried after the Retry-After pause a few times
 * before it surfaces.
 */
const MAX_IN_FLIGHT_PER_HOST = 6;
const MAX_RATE_LIMIT_RETRIES = 3;

const inFlight = new Map<string, number>();
const waiting = new Map<string, Array<() => void>>();

async function acquire(host: string): Promise<void> {
  const count = inFlight.get(host) ?? 0;
  if (count < MAX_IN_FLIGHT_PER_HOST) {
    inFlight.set(host, count + 1);
    return;
  }
  await new Promise<void>((resolve) => {
    const queue = waiting.get(host) ?? [];
    queue.push(resolve);
    waiting.set(host, queue);
  });
  inFlight.set(host, (inFlight.get(host) ?? 0) + 1);
}

function release(host: string): void {
  inFlight.set(host, Math.max(0, (inFlight.get(host) ?? 1) - 1));
  const next = waiting.get(host)?.shift();
  if (next) next();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// REQUESTS
// ============================================================================

export interface ContentHubRequest {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * One authenticated request to the tenant. A 401 drops the cached token and retries once,
 * so a token revoked on the Content Hub side costs one failed call, not an unhealthy source.
 *
 * @throws ExternalSearchError with a readable message on network, HTTP or parse failure
 */
export async function contentHubRequest<T>(
  settings: ContentHubSettings,
  path: string,
  request: ContentHubRequest = {},
  retryOnUnauthorized = true,
  rateLimitRetries = MAX_RATE_LIMIT_RETRIES,
): Promise<{ json: T; took: number }> {
  const token = await getContentHubToken(settings);
  const start = Date.now();

  let response: Response;
  let answer: Awaited<ReturnType<typeof readResponseBody>>;
  await acquire(settings.host);
  try {
    response = await fetchOnSameServer(`${settings.host}${path}`, {
      method: request.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...request.headers,
      },
      body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
      signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
    });
    answer = await readResponseBody(response);
  } catch (error) {
    throw new ExternalSearchError(
      CONTENT_HUB,
      (error as Error).name === 'TimeoutError' ? 'Content Hub request timed out' : connectFailure(CONTENT_HUB, error),
    );
  } finally {
    release(settings.host);
  }

  if (response.status === 401 && retryOnUnauthorized && settings.authType === 'oauth_client_credentials') {
    tokens.delete(tokenKey(settings));
    return contentHubRequest<T>(settings, path, request, false, rateLimitRetries);
  }
  if (response.status === 429 && rateLimitRetries > 0) {
    const retryAfter = Number(response.headers.get('retry-after') ?? '1');
    await sleep(Math.min(Math.max(retryAfter, 1), 5) * 1000);
    return contentHubRequest<T>(settings, path, request, retryOnUnauthorized, rateLimitRetries - 1);
  }
  if (!response.ok) {
    throw new ExternalSearchError(CONTENT_HUB, describeFailure(response.status, answer.text, path), response.status);
  }
  if (answer.json === undefined) {
    throw new ExternalSearchError(CONTENT_HUB, `Content Hub returned a non-JSON response (HTTP ${response.status})${bodyExcerpt(answer.text)}`);
  }
  return { json: answer.json as T, took: Date.now() - start };
}

function describeFailure(status: number, text: string, path: string): string {
  switch (status) {
    case 401:
      return 'Content Hub rejected the token — check the OAuth client and its user';
    case 403:
      return 'Content Hub refused the request — the integration user lacks permission for this definition';
    case 404:
      return `Content Hub has nothing at ${path} — check the entity definition name`;
    case 429:
      return 'Content Hub rate limit reached (15 requests per second per API user) — try again shortly';
    default:
      return `Content Hub returned HTTP ${status}${bodyExcerpt(text)}`;
  }
}

// ============================================================================
// ENTITY DEFINITIONS
// ============================================================================

/** A Content Hub entity definition, the parts discovery reads. */
export interface ContentHubDefinition {
  name: string;
  is_taxonomy_item_definition?: boolean;
  labels?: Record<string, string>;
  member_groups?: Array<{
    name?: string;
    labels?: Record<string, string>;
    members?: ContentHubMember[];
  }>;
}

export interface ContentHubMember {
  name: string;
  /** String, Boolean, Integer, Long, Decimal, DateTime, ..., or Relation */
  type: string;
  labels?: Record<string, string>;
  helptext?: Record<string, string>;
  /** String properties: SingleLine, MultiLine, Html, ... */
  content_type?: string;
  is_multilanguage?: boolean;
  is_multivalue?: boolean;
  is_secret?: boolean;
  /** Indexed for full-text search */
  included_in_content?: boolean;
  /** An option list backs this string property */
  datasource?: { href?: string };
  // Relations
  role?: 'Parent' | 'Child';
  cardinality?: string;
  associated_entitydefinition?: { href?: string };
  allow_navigation?: boolean;
  is_taxonomy_relation?: boolean;
}

export async function getEntityDefinition(settings: ContentHubSettings, name = settings.definition): Promise<ContentHubDefinition> {
  const { json } = await contentHubRequest<ContentHubDefinition>(settings, `/api/entitydefinitions/${encodeURIComponent(name)}`);
  return json;
}

// ============================================================================
// SEARCH AFTER
// ============================================================================

/** The structured filters SearchAfter V2 accepts (the ones the connector uses). */
export type ContentHubFilter =
  | { type: 'DefinitionName'; name: string }
  | { type: 'Logical'; operator: 'And' | 'Or'; left: ContentHubFilter; right: ContentHubFilter }
  | { type: 'Negating'; query: ContentHubFilter }
  | { type: 'FullText'; value: string; operator: 'Equals' }
  | { type: 'Relation'; relation: string; id: number }
  | { type: 'StringProperty'; property_name: string; operator: 'Equals' | 'DoesNotEqual' | 'Contains' | 'StartsWith' | 'EndsWith'; value: string }
  | { type: 'DateTimeProperty'; property_name: string; operator: 'GreaterThan' | 'GreaterThanOrEqual' | 'LessThan' | 'LessThanOrEqual' | 'Equals'; value: string }
  | { type: 'IdIn'; ids: number[] };

export type ContentHubLoad = 'all' | 'none' | string[];

export interface SearchAfterInput {
  filter: ContentHubFilter;
  take: number;
  sorting?: Array<{ field: string; order: 'Asc' | 'Desc' }>;
  /** `last_hit_data` of the previous page */
  searchAfter?: unknown;
  properties?: ContentHubLoad;
  relations?: ContentHubLoad;
  /** Cultures multilingual properties are returned in */
  cultures?: string[];
  /** Renditions to return as signed delivery links (e.g. 'preview'); none by default */
  renditions?: string[];
}

/** An entity as SearchAfter returns it (the parts the connector reads). */
export interface ContentHubEntity {
  id: number;
  identifier?: string;
  created_on?: string;
  modified_on?: string;
  version?: number;
  entitydefinition?: { href?: string };
  properties?: Record<string, unknown>;
  relations?: Record<string, ContentHubRelationValue>;
  /** Requested renditions as signed, time-limited delivery links */
  renditions?: Record<string, Array<{ href?: string }> | undefined>;
}

/** The signed delivery link of a rendition on an entity, when it was requested and exists. */
export function renditionHref(entity: ContentHubEntity, rendition: string): string | undefined {
  const href = entity.renditions?.[rendition]?.[0]?.href;
  return typeof href === 'string' && href ? href : undefined;
}

/** A relation on an entity: inlined parent(s) or children when loaded, else only a link. */
export interface ContentHubRelationValue {
  href?: string;
  parent?: ContentHubRelatedEntity;
  parents?: ContentHubRelatedEntity[];
  child?: ContentHubRelatedEntity;
  children?: ContentHubRelatedEntity[];
}

export interface ContentHubRelatedEntity {
  href?: string;
  properties?: Record<string, unknown>;
}

export interface SearchAfterPage {
  items: ContentHubEntity[];
  total: number;
  lastHitData?: unknown;
  took: number;
}

function loadOption(load: ContentHubLoad | undefined, kind: 'properties' | 'relations'): Record<string, unknown> {
  if (load === undefined || load === 'none') return { load_option: 'None' };
  if (load === 'all') return { load_option: 'All' };
  return kind === 'properties'
    ? { load_option: 'Custom', properties: load }
    : { load_option: 'Custom', relations: load.map((name) => ({ name })) };
}

/** Build the SearchAfter V2 body. Exported for tests. */
export function buildSearchAfterBody(input: SearchAfterInput): Record<string, unknown> {
  return {
    filter: input.filter,
    take: Math.min(Math.max(input.take, 1), CONTENT_HUB_MAX_TAKE),
    sorting: input.sorting ?? [{ field: 'identifier', order: 'Asc' }],
    ...(input.searchAfter !== undefined ? { search_after: input.searchAfter } : {}),
    load_configuration: {
      load_entities: true,
      culture_option: input.cultures?.length ? { load_option: 'Custom', cultures: input.cultures } : { load_option: 'None' },
      property_option: loadOption(input.properties, 'properties'),
      relation_option: loadOption(input.relations, 'relations'),
    },
    renditions: input.renditions?.length ? input.renditions : ['None'],
  };
}

/** One SearchAfter V2 page. */
export async function searchAfter(settings: ContentHubSettings, input: SearchAfterInput): Promise<SearchAfterPage> {
  const { json, took } = await contentHubRequest<{ items?: ContentHubEntity[]; total_items?: number; last_hit_data?: unknown }>(
    settings,
    '/api/entities/searchafter',
    { method: 'POST', headers: { 'X-ApiVersion': '2' }, body: buildSearchAfterBody(input) },
  );
  return {
    items: json.items ?? [],
    total: json.total_items ?? 0,
    lastHitData: json.last_hit_data,
    took,
  };
}

/** How many entities match a filter: a SearchAfter call that loads nothing. */
export async function countEntities(settings: ContentHubSettings, filter: ContentHubFilter): Promise<number> {
  const { json } = await contentHubRequest<{ total_items?: number }>(settings, '/api/entities/searchafter', {
    method: 'POST',
    headers: { 'X-ApiVersion': '2' },
    body: { filter, take: 0, sorting: [{ field: 'identifier', order: 'Asc' }], load_configuration: { load_entities: false } },
  });
  return json.total_items ?? 0;
}

/**
 * One page of the V1 query API (`GET /api/entities/query`). Its expression language is
 * limited (equality, full text, parent-by-id), but it is the one call that lists the public
 * links of many assets at once: `Parent('AssetToPublicLink').id==N OR ...`.
 */
export async function queryEntitiesV1(
  settings: ContentHubSettings,
  query: string,
  options: { take?: number; members?: string[] } = {},
): Promise<{ items: ContentHubEntity[]; total: number }> {
  const params = new URLSearchParams({ query, take: String(Math.min(options.take ?? CONTENT_HUB_MAX_TAKE, CONTENT_HUB_MAX_TAKE)) });
  if (options.members?.length) params.set('members', options.members.join(','));
  const { json } = await contentHubRequest<{ items?: ContentHubEntity[]; total_items?: number }>(settings, `/api/entities/query?${params}`);
  return { items: json.items ?? [], total: json.total_items ?? 0 };
}

/** The entities a relation of one entity points at (ids only), read directly. */
export async function getRelationIds(settings: ContentHubSettings, entityId: number, relation: string): Promise<number[]> {
  const { json } = await contentHubRequest<{ parent?: { href?: string }; parents?: Array<{ href?: string }>; child?: { href?: string }; children?: Array<{ href?: string }> }>(
    settings,
    `/api/entities/${entityId}/relations/${encodeURIComponent(relation)}`,
  );
  const related = json.parents ?? json.children ?? (json.parent ? [json.parent] : json.child ? [json.child] : []);
  return related.map((r) => Number(r.href?.split('/').pop())).filter((id) => Number.isInteger(id));
}

/** The definition filter every query on a source starts from. */
export function definitionFilter(settings: ContentHubSettings): ContentHubFilter {
  return { type: 'DefinitionName', name: settings.definition };
}

/** AND two filters; either side may be absent. */
export function andFilters(left: ContentHubFilter | undefined, right: ContentHubFilter | undefined): ContentHubFilter | undefined {
  if (!left) return right;
  if (!right) return left;
  return { type: 'Logical', operator: 'And', left, right };
}

/**
 * OR many filters as a balanced tree. SearchAfter rejects a left-leaning chain of more than
 * about 25 clauses as too deeply nested; a balanced tree of 100 is accepted.
 */
export function orFilters(filters: ContentHubFilter[]): ContentHubFilter | undefined {
  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  const mid = Math.ceil(filters.length / 2);
  return { type: 'Logical', operator: 'Or', left: orFilters(filters.slice(0, mid))!, right: orFilters(filters.slice(mid))! };
}
