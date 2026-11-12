// src/features/access/picker-reads.ts

/**
 * The list reads an experience editor's pickers make. Open to anyone in PICKER_READERS, but a
 * role without the list's own view permission gets each row cut down to what the picker shows
 * (an allow-list): no connection settings, auth settings, health messages, prompt text, document
 * samples, or an MCP address (like an AI provider's address, it can name an internal host).
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

/** A field's name and how it can be used, without the values sampled from documents (`profile`) */
const schemaWithoutSamples = (schema: unknown): unknown => {
  const strip = (fields: unknown) => (Array.isArray(fields) ? fields.map((f) => (isRow(f) ? (({ profile: _, ...rest }) => rest)(f) : f)) : fields);
  if (Array.isArray(schema)) return strip(schema);
  return isRow(schema) && 'fields' in schema ? { ...schema, fields: strip(schema.fields) } : schema;
};

/** What each picker shows of a row */
export const PICKER_FIELDS = {
  tools: only(['id', 'name', 'slug', 'description', 'aiDescription', 'executorType', 'operation', 'notReadyReason', 'isActive', 'isBuiltIn']),
  /** The tool names and descriptions to switch on; the name tells connections apart */
  mcpConnections: (row: Row): Row => {
    const catalog = row.discoveredTools as { tools?: unknown } | null | undefined;
    const tools = Array.isArray(catalog?.tools) ? catalog.tools.map((t) => (isRow(t) ? only(['name', 'description'])(t) : t)) : undefined;
    return {
      ...only(['id', 'name', 'slug', 'description', 'transport', 'status', 'isActive', 'isBuiltIn'])(row),
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
  /** The fields of an index the display-field picker lists: no filter values or field settings */
  indexFields: only(['id', 'fieldName', 'displayName', 'fieldType', 'includeInResponse']),
} satisfies Record<string, (row: Row) => Row>;

/** `data` as a picker reader sees it: a list, a page (`items`), one row, or (byStep) a row per step */
function cutDown(data: unknown, pick: (row: Row) => Row, byStep: boolean): unknown {
  if (Array.isArray(data)) return data.map((r) => (isRow(r) ? pick(r) : r));
  if (!isRow(data)) return data;
  if (Array.isArray(data.items)) return { ...data, items: cutDown(data.items, pick, false) };
  if (byStep) return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, isRow(v) ? pick(v) : v]));
  return pick(data);
}

/** `res` as is for a caller holding `view`; otherwise its JSON `data` reshaped by `shape` */
async function cutUnless(res: Response, view: Permission, shape: (data: unknown) => unknown): Promise<Response> {
  const { access } = await checkAccess(SIGNED_IN);
  // A caller who views the list, or an answer that carries no rows (an error, an empty answer)
  if ((access && can(access, view)) || !res.ok || res.status === 204) return res;
  // An answer of a shape the cut doesn't know is refused, never passed on uncut
  const body = res.headers.get('content-type')?.includes('application/json') ? ((await res.json()) as unknown) : null;
  if (!isRow(body) || !('data' in body)) {
    return NextResponse.json({ success: false, error: 'The answer could not be shaped for your role.' }, { status: 500 });
  }
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  return NextResponse.json({ ...body, data: shape(body.data) }, { status: res.status, headers });
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
  return withPermission(rule, async (...args: A): Promise<Response> =>
    cutUnless(await handler(...args), rule[0], (data) => cutDown(data, PICKER_FIELDS[fields], options.byStep ?? false)),
  );
}

/**
 * The MCP connections attached to a chat experience, for anyone who views the experience: a
 * caller who can't view tools gets each attached connection as the MCP picker shows it.
 */
export function forExperienceMcpAttachments<A extends unknown[]>(handler: (...args: A) => Response | Promise<Response>) {
  return withPermission('ai-experiences:view', async (...args: A): Promise<Response> =>
    cutUnless(await handler(...args), 'tools:view', (data) =>
      Array.isArray(data)
        ? data.map((a) => (isRow(a) && isRow(a.mcpConnection) ? { ...a, mcpConnection: PICKER_FIELDS.mcpConnections(a.mcpConnection) } : a))
        : data,
    ),
  );
}

/**
 * An experience read (list, one experience, create, update) for anyone who may read experiences:
 * a caller who can't view tools gets the tool and MCP connection rows attached to it as the
 * pickers show them. The one place these embedded rows are cut, so no experience read can
 * hand out a row the tool and MCP lists would cut.
 */
export function forExperienceRows<A extends unknown[]>(handler: (...args: A) => Response | Promise<Response>) {
  const cutExperience = (exp: unknown): unknown => {
    if (!isRow(exp)) return exp;
    const cutEach = (list: unknown, key: string, pick: (row: Row) => Row) =>
      Array.isArray(list) ? list.map((a) => (isRow(a) && isRow(a[key]) ? { ...a, [key]: pick(a[key] as Row) } : a)) : list;
    return {
      ...exp,
      ...('tools' in exp && { tools: cutEach(exp.tools, 'tool', PICKER_FIELDS.tools) }),
      ...('mcpConnections' in exp && { mcpConnections: cutEach(exp.mcpConnections, 'mcpConnection', PICKER_FIELDS.mcpConnections) }),
    };
  };
  return async (...args: A): Promise<Response> =>
    cutUnless(await handler(...args), 'tools:view', (data) => (Array.isArray(data) ? data.map(cutExperience) : cutExperience(data)));
}
