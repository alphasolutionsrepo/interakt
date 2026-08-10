// src/features/pipeline/v2/data-context.ts

/**
 * Renders the data a turn can actually query into text the planner can use.
 *
 * The planner previously received `{{toolList}}` and `{{businessDomain}}`, and the shipped
 * default template told it outright: *"The backend will resolve exact valid field names and
 * values automatically — you do not need to know the schema."* That holds for a clean
 * product catalog, where facetable fields and value mappings make it true. It is false for
 * any index whose interesting concepts live in free text and whose structured attributes are
 * sparse — which describes most content and document indexes, and every crawled external
 * one.
 *
 * The consequence was concrete: for a topical question against a content index, the planner
 * chose an enumerate over a search, and the only fix available was to hand-write field names
 * into a per-index prompt. That is a solution for one index, not a product.
 *
 * Field profiling supplies the missing facts. They reached the model only when it chose to
 * call `inspect` first — an extra LLM round-trip, and one the planner has no reason to make
 * when it believes it does not need the schema. Rendering them at plan time removes both
 * the round-trip and the belief.
 *
 * Rendering rules, because this text is in every planning call:
 *   - Deterministic ordering, so two identical turns produce an identical prompt.
 *   - Hard caps on fields and values, and the omission is stated rather than hidden — a
 *     silently truncated field list reads as a complete one.
 *   - Compact tabular text, not JSON. JSON spends tokens on syntax the model does not need.
 *   - Nothing is included that profiling did not measure. An unprofiled source contributes
 *     its field names only.
 */

import type { DataSourceField } from '@/db/schema/data-sources.schema';

// ============================================================================
// LIMITS
// ============================================================================

/**
 * Defaults, used when no policy limits are supplied. Enough to cover a normal catalog or
 * content index; wide crawled indexes get the most useful fields and a stated remainder.
 * Operators override these per experience through ExecutionPolicy, since the trade is prompt
 * cost against plan quality and only they can price it.
 */
export const DEFAULT_MAX_FIELDS_PER_SOURCE = 30;
export const DEFAULT_MAX_VALUES_PER_FIELD = 8;

/** A field empty in at least this share of sampled documents is called out as unreliable. */
const UNRELIABLE_NULL_RATE = 0.5;

/** Caps on how much of a schema reaches the planning prompt. */
export interface DataContextLimits {
  maxFieldsPerSource?: number;
  maxValuesPerField?: number;
}

function resolveLimits(limits?: DataContextLimits): Required<DataContextLimits> {
  const fields = limits?.maxFieldsPerSource;
  const values = limits?.maxValuesPerField;
  return {
    maxFieldsPerSource: Number.isFinite(fields) && fields! >= 0 ? fields! : DEFAULT_MAX_FIELDS_PER_SOURCE,
    maxValuesPerField: Number.isFinite(values) && values! >= 0 ? values! : DEFAULT_MAX_VALUES_PER_FIELD,
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface DataContextSource {
  /** Tool slugs that read this source, so the planner can connect fields to a tool. */
  toolSlugs: string[];
  sourceName: string;
  fields: DataSourceField[];
}

// ============================================================================
// FIELD SELECTION
// ============================================================================

/**
 * Order fields by how much they help choose a query, not alphabetically.
 *
 * A planner's decisions are "what do I filter on", "what do I sort by" and "what is free
 * text". Fields that answer those come first; fields that are empty in most documents sink,
 * because relying on one is how a turn returns nothing while looking correct.
 */
function planningUsefulness(field: DataSourceField): number {
  let score = 0;

  // Free-text search is the planner's first and most consequential decision — what goes in
  // the query. Searchable fields and the semantic anchors (title, description, content) are
  // therefore worth more than anything filterable. Ranking these below filterability put a
  // catalog's product name and descriptions below its image URLs, which is backwards: the
  // planner cannot search well without knowing which fields carry the prose.
  if (field.isSearchable) score += 6;
  if (field.role === 'title' || field.role === 'description' || field.role === 'content') score += 6;

  // A populated field that profiling declined to give example values for is prose — that is
  // precisely what the "too varied / too long to enumerate" checks detect. Those fields are
  // the free-text surface a topical query has to land on.
  //
  // Inferred from the profile rather than the name because role inference is name-exact:
  // it recognises `description` and `summary` and misses `shortDescription`,
  // `longDescription`, `body_copy` and every non-English equivalent. Extending that name
  // list is how a product turns into a per-customer solution.
  if (isProseSurface(field)) score += 5;

  if (field.profile?.sampleValues?.length) score += 8;
  if (field.isFilterable) score += 4;
  if (field.isFacetable) score += 2;
  if (field.isSortable) score += 1;
  if (field.description) score += 3;

  // Payload, not query surface. Nobody filters by image URL or internal id, and every line
  // spent on one displaces a field the planner could have used.
  if (field.role === 'image' || field.role === 'url' || field.role === 'id') score -= 8;
  if (holdsUrls(field)) score -= 8;

  if ((field.profile?.nullRate ?? 0) >= UNRELIABLE_NULL_RATE) score -= 10;
  return score;
}

/**
 * Is this a populated free-text field — the surface a topical query searches?
 *
 * Profiling withholds example values from fields whose values are too varied or too long to
 * enumerate, which is the same thing as saying they hold prose. Reusing that verdict avoids
 * a second, competing definition of "free text".
 */
function isProseSurface(field: DataSourceField): boolean {
  const profile = field.profile;
  if (!profile || !field.isSearchable) return false;
  return !profile.sampleValues?.length
    && profile.distinctInSample > 0
    && profile.nullRate < UNRELIABLE_NULL_RATE;
}

/**
 * Do this field's observed values look like URLs?
 *
 * Driven by the sampled values rather than the field's name, because name-matching is how a
 * product becomes a per-customer solution: `primaryImageUrl`, `image_1`, `hero_asset` and
 * `bild_url` are the same thing to a planner and no name list catches them all. Role
 * inference misses most of them for exactly that reason.
 */
function holdsUrls(field: DataSourceField): boolean {
  const values = field.profile?.sampleValues;
  if (!values?.length) return false;
  return values.every((v) => /^(https?:\/\/|\/)/.test(v));
}

function selectFields(
  fields: DataSourceField[],
  maxFields: number,
): { shown: DataSourceField[]; omitted: number } {
  // Sort by usefulness, then by name so ties are stable across turns.
  const ordered = [...fields].sort(
    (a, b) => planningUsefulness(b) - planningUsefulness(a) || a.name.localeCompare(b.name),
  );
  return {
    shown: ordered.slice(0, maxFields),
    omitted: Math.max(0, ordered.length - maxFields),
  };
}

// ============================================================================
// RENDERING
// ============================================================================

/** Short capability tag list: what the provider will let the planner do with this field. */
function capabilities(field: DataSourceField): string {
  const tags: string[] = [];
  if (field.isSearchable) tags.push('searchable');
  if (field.isFilterable) tags.push('filterable');
  if (field.isSortable) tags.push('sortable');
  return tags.length > 0 ? tags.join('/') : 'returned only';
}

function renderField(field: DataSourceField, maxValues: number): string {
  const parts = [`- ${field.name} (${field.type}, ${capabilities(field)})`];

  if (field.description) parts.push(`  ${field.description}`);

  const profile = field.profile;
  if (profile) {
    if (profile.nullRate >= UNRELIABLE_NULL_RATE) {
      // Stated as a share rather than a flag so the planner can weigh it.
      parts.push(`  empty in ${Math.round(profile.nullRate * 100)}% of sampled documents — do not rely on it`);
    }
    // URLs are listed as a field but never as values: eight asset links cost real tokens
    // and tell the planner nothing it can filter or search on.
    if (maxValues > 0 && profile.sampleValues?.length && !holdsUrls(field)) {
      const shown = profile.sampleValues.slice(0, maxValues);
      const more = profile.sampleValues.length - shown.length;
      parts.push(`  values: ${shown.join(', ')}${more > 0 ? `, … (${more} more seen)` : ''}`);
    }
  }

  return parts.join('\n');
}

function renderSource(source: DataContextSource, limits: Required<DataContextLimits>): string {
  const { shown, omitted } = selectFields(source.fields, limits.maxFieldsPerSource);
  const via = source.toolSlugs.length > 0 ? ` — queried via ${source.toolSlugs.join(', ')}` : '';
  const lines = [`### ${source.sourceName}${via}`];

  if (shown.length === 0) {
    lines.push('No field information has been discovered for this source yet.');
    return lines.join('\n');
  }

  lines.push(...shown.map((f) => renderField(f, limits.maxValuesPerField)));

  if (omitted > 0) {
    // Saying so matters: a truncated list the planner believes is complete will make it
    // conclude a field does not exist.
    lines.push(`(${omitted} further field${omitted === 1 ? '' : 's'} not listed — use an inspect tool if you need them.)`);
  }

  return lines.join('\n');
}

/**
 * Render the data context block for a planning prompt.
 *
 * Returns an empty string when there is nothing worth saying, so the template collapses
 * cleanly rather than emitting an empty heading.
 */
export function buildDataContext(
  sources: DataContextSource[],
  limits?: DataContextLimits,
): string {
  const resolved = resolveLimits(limits);
  // A zero field budget turns the block off entirely, which is how an operator opts out of
  // paying for schema in every planning call.
  if (resolved.maxFieldsPerSource === 0) return '';

  const usable = sources.filter((s) => s.fields.length > 0);
  if (usable.length === 0) return '';

  // Deterministic order across turns.
  const ordered = [...usable].sort((a, b) => a.sourceName.localeCompare(b.sourceName));

  return [
    '## The data you can query',
    'Field facts below were measured from a sample of real documents. Prefer a text search'
      + ' for topical or descriptive requests, and use a filter only on a field listed as'
      + ' filterable whose values match what the user asked for.',
    '',
    ordered.map((s) => renderSource(s, resolved)).join('\n\n'),
  ].join('\n');
}
