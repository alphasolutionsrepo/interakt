// src/features/access/picker-reads.ts

/**
 * The list reads an experience editor's pickers make. Open to anyone in PICKER_READERS, but a
 * role without the list's own view permission gets each row cut down to what the picker shows
 * (an allow-list): no connection settings, auth settings, health messages, prompt text, document
 * samples, or anything in an MCP address beyond its host.
 */

import 'server-only';

import { NextResponse } from 'next/server';

import { PICKER_READERS, type Permission } from './permissions';
import { checkAccess, SIGNED_IN, withPermission } from './route-guard';
import { can } from './user-access';

type Row = Record<string, unknown>;

const isRow = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);

const only = (keys: readonly string[]) => (row: Row): Row =>
  Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, row[k]]));

/** The host of an MCP address only: its path, query or user part can carry a token */
function hostOf(url: unknown): string | undefined {
  try {
    return typeof url === 'string' ? new URL(url).host : undefined;
  } catch {
    return undefined;
  }
}

/** A field's name and how it can be used, without the values sampled from documents (`profile`) */
const schemaWithoutSamples = (schema: unknown): unknown => {
  const strip = (fields: unknown) => (Array.isArray(fields) ? fields.map((f) => (isRow(f) ? (({ profile: _, ...rest }) => rest)(f) : f)) : fields);
  if (Array.isArray(schema)) return strip(schema);
  return isRow(schema) && 'fields' in schema ? { ...schema, fields: strip(schema.fields) } : schema;
};

/** What each picker shows of a row */
export const PICKER_FIELDS = {
  tools: only(['id', 'name', 'slug', 'description', 'aiDescription', 'executorType', 'operation', 'notReadyReason', 'isActive', 'isBuiltIn']),
  /** The tool names and descriptions to switch on, and the host to tell connections apart */
  mcpConnections: (row: Row): Row => {
    const catalog = row.discoveredTools as { tools?: unknown } | null | undefined;
    const tools = Array.isArray(catalog?.tools) ? catalog.tools.map((t) => (isRow(t) ? only(['name', 'description'])(t) : t)) : undefined;
    const host = hostOf(row.serverUrl);
    return {
      ...only(['id', 'name', 'slug', 'description', 'transport', 'status', 'isActive', 'isBuiltIn'])(row),
      ...(host !== undefined && { serverUrl: host }),
      ...(tools !== undefined && { discoveredTools: { tools } }),
    };
  },
  prompts: only(['id', 'step', 'version', 'label', 'status', 'isSystemDefault']),
  /** The provider names the external index in the picker; the rest of `config` is connection settings */
  dataSources: (row: Row): Row => {
    const provider = (row.config as { provider?: unknown } | null | undefined)?.provider;
    return {
      ...only(['id', 'name', 'slug', 'type', 'isActive', 'isBuiltIn'])(row),
      ...('schema' in row && { schema: schemaWithoutSamples(row.schema) }),
      ...(provider !== undefined && { config: { provider } }),
    };
  },
  indexes: only(['id', 'name', 'displayName', 'description', 'searchType', 'searchProvider', 'status', 'documentCount', 'isActive', 'isBuiltIn']),
} satisfies Record<string, (row: Row) => Row>;

/** `data` as a picker reader sees it: a list, a page (`items`), one row, or (byStep) a row per step */
function cutDown(data: unknown, pick: (row: Row) => Row, byStep: boolean): unknown {
  if (Array.isArray(data)) return data.map((r) => (isRow(r) ? pick(r) : r));
  if (!isRow(data)) return data;
  if (Array.isArray(data.items)) return { ...data, items: cutDown(data.items, pick, false) };
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
