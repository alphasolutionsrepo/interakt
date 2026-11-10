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

import { and, eq } from 'drizzle-orm';

import { AccessDeniedError } from './access-policy';
import { BUILT_IN_REFUSAL } from './permissions';
import { checkAccess, SIGNED_IN, withPermission, withPermissionOrIngestionKey, type AccessRule } from './route-guard';

import { db } from '@/db/index';
import { aiExperiences, aiExperienceTools } from '@/db/schema/ai-experience.schema';
import { dataSources } from '@/db/schema/data-sources.schema';
import { searchExperienceIndexes, searchExperiences } from '@/db/schema/search-experience.schema';
import { searchIndex } from '@/db/schema/search-index.schema';
import { tools } from '@/db/schema/tools.schema';
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
 * Whether the row is built in: marked so by the docs setup, or (a tool or an index) used by a
 * built-in help experience, such as one an Admin attached later. An id that can't name a row
 * isn't (the route answers it).
 */
export async function isBuiltIn(kind: BuiltInKind, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const table = TABLES[kind];
  const [row] = await db.select({ isBuiltIn: table.isBuiltIn }).from(table).where(eq(table.id, id)).limit(1);
  if (row?.isBuiltIn === true) return true;
  if (kind === 'tool') {
    const [used] = await db.select({ id: aiExperienceTools.id }).from(aiExperienceTools)
      .innerJoin(aiExperiences, eq(aiExperiences.id, aiExperienceTools.aiExperienceId))
      .where(and(eq(aiExperienceTools.toolId, id), eq(aiExperiences.isBuiltIn, true))).limit(1);
    return !!used;
  }
  if (kind === 'search-index') {
    const [used] = await db.select({ id: searchExperienceIndexes.id }).from(searchExperienceIndexes)
      .innerJoin(searchExperiences, eq(searchExperiences.id, searchExperienceIndexes.searchExperienceId))
      .where(and(eq(searchExperienceIndexes.searchIndexId, id), eq(searchExperiences.isBuiltIn, true))).limit(1);
    return !!used;
  }
  return false;
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

/** forBuiltInChange for the index document routes, which servers also call with an ingestion key. */
export function forBuiltInDocumentChange<A extends [NextRequestLike, { params: Promise<{ id: string }> }, ...unknown[]]>(
  rule: AccessRule,
  handler: (...args: A) => Response | Promise<Response>,
) {
  return forBuiltInChange('search-index', rule, handler, { ingestionKey: true });
}
