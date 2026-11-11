// src/features/access/picker-reads.ts

/**
 * The list reads an experience editor's pickers make. Open to anyone in PICKER_READERS, but a
 * role without the list's own view permission gets each row cut down to what the picker shows
 * (an allow-list): no connection settings, auth settings, health messages or prompt text.
 */

import 'server-only';

import { NextResponse } from 'next/server';

import { PICKER_READERS, type Permission } from './permissions';
import { checkAccess, SIGNED_IN, withPermission } from './route-guard';
import { can } from './user-access';

type Row = Record<string, unknown>;

const only = (keys: readonly string[]) => (row: Row): Row =>
  Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, row[k]]));

/** What each picker shows of a row */
export const PICKER_FIELDS = {
  tools: only(['id', 'name', 'slug', 'description', 'aiDescription', 'executorType', 'operation', 'notReadyReason', 'isActive', 'isBuiltIn']),
  mcpConnections: only(['id', 'name', 'slug', 'description', 'serverUrl', 'transport', 'discoveredTools', 'status', 'isActive', 'isBuiltIn']),
  prompts: only(['id', 'step', 'version', 'label', 'status', 'isSystemDefault']),
  /** The provider names the external index in the picker; the rest of `config` is connection settings */
  dataSources: (row: Row): Row => {
    const provider = (row.config as { provider?: unknown } | null | undefined)?.provider;
    return {
      ...only(['id', 'name', 'slug', 'type', 'schema', 'isActive', 'isBuiltIn'])(row),
      ...(provider !== undefined && { config: { provider } }),
    };
  },
} satisfies Record<string, (row: Row) => Row>;

const isRow = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);

/** `data` as a picker reader sees it: a list, one row, or (byStep) a row per step */
function cutDown(data: unknown, pick: (row: Row) => Row, byStep: boolean): unknown {
  if (Array.isArray(data)) return data.map((r) => (isRow(r) ? pick(r) : r));
  if (!isRow(data)) return data;
  if (byStep) return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, isRow(v) ? pick(v) : v]));
  return pick(data);
}

/**
 * The gate for a picker's list route: PICKER_READERS[kind]; a caller without its view
 * permission (the first one listed) gets `data` cut down to `fields`.
 */
export function forPickers<A extends unknown[]>(
  kind: keyof typeof PICKER_READERS,
  fields: keyof typeof PICKER_FIELDS,
  handler: (...args: A) => Response | Promise<Response>,
  options: { byStep?: boolean } = {},
) {
  const rule = PICKER_READERS[kind];
  const view: Permission = rule[0];
  return withPermission(rule, async (...args: A): Promise<Response> => {
    const res = await handler(...args);
    const { access } = await checkAccess(SIGNED_IN);
    if ((access && can(access, view)) || !res.headers.get('content-type')?.includes('application/json')) return res;
    const body = (await res.json()) as unknown;
    const headers = new Headers(res.headers);
    headers.delete('content-length');
    const shaped = isRow(body) && 'data' in body ? { ...body, data: cutDown(body.data, PICKER_FIELDS[fields], options.byStep ?? false) } : body;
    return NextResponse.json(shaped, { status: res.status, headers });
  });
}
