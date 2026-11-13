// src/features/access/built-in.ts

/**
 * The built-in help (the Help Assistant and docs search) is open to every signed-in user, so
 * everything the docs setup made for it — the two experiences, the docs data source and its
 * tools, the docs search index — is marked built in and only an Admin may change it, as may only
 * an Admin a tool or index attached to a built-in experience. A role that edits experiences,
 * tools, data sources or indexes could otherwise change what the help does or returns for
 * everyone. Deliberately not further: what an Admin connects behind an attached tool (its data
 * source, an MCP connection, an external source) keeps its usual permissions.
 */

import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import { AccessDeniedError } from './access-policy';
import { BUILT_IN_REFUSAL } from './permissions';
import { checkAccess, SIGNED_IN, withPermission, withPermissionOrIngestionKey, type AccessRule } from './route-guard';

import { db } from '@/db/index';
import { aiExperiences, aiExperienceTools } from '@/db/schema/ai-experience.schema';
import { dataSources } from '@/db/schema/data-sources.schema';
import { searchExperienceIndexes, searchExperiences } from '@/db/schema/search-experience.schema';
import { searchIndex } from '@/db/schema/search-index.schema';
import { tools } from '@/db/schema/tools.schema';
import { withRateLimit, type RateLimitConfig } from '@/shared/api/rate-limit';
import { apiResponse } from '@/shared/api/response';

const TABLES = {
  'ai-experience': aiExperiences,
  'search-experience': searchExperiences,
  tool: tools,
  'data-source': dataSources,
  'search-index': searchIndex,
} as const;

export type BuiltInKind = keyof typeof TABLES;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const REFUSAL = BUILT_IN_REFUSAL;

export const GUARDS_BUILT_IN = Symbol.for('interakt.guardsBuiltIn');

/**
 * Marks a route whose handler refuses a non-Admin's change to the built-in help itself
 * (assertMayChange on a row it's given, such as the data source tools are made from), so the
 * route snapshot records it like the routes forBuiltInChange wraps.
 */
export function checksBuiltInInHandler<T extends object>(route: T): T {
  Object.defineProperty(route, GUARDS_BUILT_IN, { value: true });
  return route;
}

/**
 * Which of these rows are built in: marked so by the docs setup, or (a tool or an index) used by
 * a built-in help experience, such as one an Admin attached later. The one owner of the rule:
 * the route gate (isBuiltIn) and the admin's lists and pages (withBuiltInFlag) both read it.
 * Ids that can't name a row aren't (the route answers them).
 */
export async function builtInIds(kind: BuiltInKind, ids: readonly string[]): Promise<Set<string>> {
  const valid = [...new Set(ids)].filter((id) => UUID.test(id));
  if (valid.length === 0) return new Set();
  const table = TABLES[kind];
  // Marked rows, and (tools, indexes) rows a built-in experience uses: asked together
  const usedByBuiltIn =
    kind === 'tool'
      ? db.selectDistinct({ id: aiExperienceTools.toolId }).from(aiExperienceTools)
        .innerJoin(aiExperiences, eq(aiExperiences.id, aiExperienceTools.aiExperienceId))
        .where(and(inArray(aiExperienceTools.toolId, valid), eq(aiExperiences.isBuiltIn, true)))
      : kind === 'search-index'
        ? db.selectDistinct({ id: searchExperienceIndexes.searchIndexId }).from(searchExperienceIndexes)
          .innerJoin(searchExperiences, eq(searchExperiences.id, searchExperienceIndexes.searchExperienceId))
          .where(and(inArray(searchExperienceIndexes.searchIndexId, valid), eq(searchExperiences.isBuiltIn, true)))
        : Promise.resolve([] as Array<{ id: string }>);
  const [marked, used] = await Promise.all([
    db.select({ id: table.id }).from(table).where(and(inArray(table.id, valid), eq(table.isBuiltIn, true))),
    usedByBuiltIn,
  ]);
  const found = new Set([...marked, ...used].map((r) => r.id));
  return found;
}

/** Whether one row is built in (see builtInIds). */
export async function isBuiltIn(kind: BuiltInKind, id: string): Promise<boolean> {
  return (await builtInIds(kind, [id])).has(id);
}

/**
 * Rows for the admin UI with isBuiltIn as the server enforces it (including "used by a built-in
 * experience"), so the UI locks exactly what the routes refuse.
 */
export async function withBuiltInFlag<T extends { id: string }>(kind: BuiltInKind, rows: T[]): Promise<Array<T & { isBuiltIn: boolean }>> {
  const builtIn = await builtInIds(kind, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, isBuiltIn: builtIn.has(r.id) }));
}

/** Mark rows the docs setup made as built in. */
export async function markBuiltIn(kind: BuiltInKind, ids: readonly string[]): Promise<void> {
  const table = TABLES[kind];
  for (const id of ids) await db.update(table).set({ isBuiltIn: true }).where(eq(table.id, id));
}

/** Throws unless the caller is an Admin or the row isn't built in (for changes that name the row in the body). */
export async function assertMayChange(kind: BuiltInKind, id: string): Promise<void> {
  const { access } = await checkAccess(SIGNED_IN);
  if (!access?.isAdmin && (await isBuiltIn(kind, id))) throw new AccessDeniedError(REFUSAL);
}

/**
 * The gate for a route that changes the row named by its `[id]`: `rule` (or an ingestion key,
 * for the document routes), and Admin for a built-in row. An ingestion key is never an Admin.
 * Every such route uses this (routes.access.test).
 */
export function forBuiltInChange<A extends [NextRequestLike, { params: Promise<{ id: string }> }, ...unknown[]]>(
  kind: BuiltInKind,
  rule: AccessRule,
  handler: (...args: A) => Response | Promise<Response>,
  options: { ingestionKey?: boolean } = {},
) {
  const guarded = async (...args: A): Promise<Response> => {
    const { id } = await args[1].params;
    const { access } = await checkAccess(SIGNED_IN).catch(() => ({ access: undefined }));
    if (!access?.isAdmin) {
      let builtIn: boolean;
      try {
        builtIn = await isBuiltIn(kind, id);
      } catch (error) {
        // Can't tell (database down): answer and log it like any API error, change nothing
        return apiResponse.error(error, 500, { operation: 'checkBuiltIn' });
      }
      if (builtIn) return apiResponse.forbidden(REFUSAL);
    }
    return handler(...args);
  };
  const route = options.ingestionKey
    ? withPermissionOrIngestionKey(rule, guarded as never)
    : withPermission(rule, guarded);
  Object.defineProperty(route, GUARDS_BUILT_IN, { value: true });
  return route as (...args: A) => Promise<Response>;
}

type NextRequestLike = Request;

/**
 * forBuiltInChange for the index document routes, which servers also call with an ingestion key.
 * A rate limit, when given, runs before the access checks, so every caller is counted and answered alike
 * (a wrong key gets the same limit headers, and 429, whether Managed indexes is on or off).
 */
export function forBuiltInDocumentChange<A extends [NextRequestLike, { params: Promise<{ id: string }> }, ...unknown[]]>(
  rule: AccessRule,
  handler: (...args: A) => Response | Promise<Response>,
  rateLimit?: RateLimitConfig,
) {
  const route = forBuiltInChange('search-index', rule, handler, { ingestionKey: true });
  if (!rateLimit) return route;
  const limited = withRateLimit(route as never, rateLimit) as typeof route;
  // The route checks (routes.access.test) read the access markers off the exported handler
  for (const marker of Object.getOwnPropertySymbols(route)) {
    Object.defineProperty(limited, marker, { value: (route as unknown as Record<symbol, unknown>)[marker] });
  }
  return limited;
}
