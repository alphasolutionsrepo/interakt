// src/features/tools/executors/filter-defaults.ts

/**
 * Tool-configured default filters and sort.
 *
 * `defaultFilters` and `defaultSort` have been declared in the search tool config types,
 * validated on save, and editable in the tool wizard for a long time — and read by
 * nothing. Configuring one did exactly nothing, which is worse than not offering it.
 *
 * Applying them needs one rule and one guarantee:
 *
 *   Rule: a filter the caller requested wins over a default on the same field. A default
 *   is a starting point, not a lock — if the model asks for `brand = Vesper` it must not
 *   be silently ANDed with `brand = Atelier` into a query that can never match.
 *
 *   Guarantee: every default that ends up applied is reported back. A default filter
 *   narrows the result set invisibly otherwise — a hand-picked `sitedomain` default once
 *   removed an entire content category from a demo index with no trace anywhere, and
 *   nothing in the result or the trace could explain the missing documents.
 */

import type { UnappliedClause } from './external-query';

import type { FilterClause, SortClause } from '@/features/search/search.types';

export interface MergedFilters {
  filters: FilterClause[];
  /** Defaults that survived the merge — for the result payload and the trace. */
  appliedDefaults: FilterClause[];
}

export interface MergedSort {
  sort: SortClause[];
  /** True when the ordering came from tool config rather than the caller. */
  fromDefault: boolean;
}

/**
 * Merge configured default filters with the caller's filters.
 *
 * Defaults come first so the cheaper, more selective config-level constraints lead the
 * expression, and a requested filter on the same field replaces the default outright.
 */
export function mergeDefaultFilters(
  defaults: Array<{ field: string; operator: string; value: unknown }> | undefined,
  requested: FilterClause[],
): MergedFilters {
  if (!defaults?.length) return { filters: requested, appliedDefaults: [] };

  const requestedFields = new Set(requested.map((f) => f.field));
  const appliedDefaults = defaults
    .filter((d) => !requestedFields.has(d.field))
    .map((d) => ({
      field: d.field,
      operator: d.operator as FilterClause['operator'],
      value: d.value as FilterClause['value'],
    }));

  return { filters: [...appliedDefaults, ...requested], appliedDefaults };
}

/**
 * Choose between the caller's sort and the configured default.
 *
 * Sort is all-or-nothing rather than merged per field: interleaving a default ordering
 * into a requested one changes what "sorted by relevance then date" means, and the caller
 * asking for any ordering at all is a clear signal it has an opinion.
 */
export function mergeDefaultSort(
  defaults: Array<{ field: string; direction: 'asc' | 'desc' }> | undefined,
  requested: SortClause[],
): MergedSort {
  if (requested.length > 0) return { sort: requested, fromDefault: false };
  if (!defaults?.length) return { sort: [], fromDefault: false };

  return {
    sort: defaults.map((d) => ({ field: d.field, direction: d.direction })),
    fromDefault: true,
  };
}

// ============================================================================
// REPORTING
// ============================================================================

/**
 * Describe what configuration and translation did to the request, for the result payload.
 *
 * Keys are present only when something actually happened, so an ordinary search payload is
 * byte-for-byte what it was before and no tokens are spent saying "nothing was applied".
 */
export function describeAppliedConfig(
  appliedDefaultFilters: FilterClause[],
  sorting: { sort: Array<{ field: string; direction: string }>; fromDefault: boolean },
  unappliedFilters: UnappliedClause[] = [],
  unappliedSort: UnappliedClause[] = [],
): Record<string, unknown> {
  return {
    ...(appliedDefaultFilters.length > 0 ? { appliedDefaultFilters } : {}),
    ...(sorting.fromDefault && sorting.sort.length > 0 ? { appliedDefaultSort: sorting.sort } : {}),
    ...(unappliedFilters.length > 0 ? { unappliedFilters } : {}),
    ...(unappliedSort.length > 0 ? { unappliedSort } : {}),
  };
}

/**
 * Merge the annotations from describeAppliedConfig into a provider result.
 *
 * A failed result is returned untouched — the error message is what matters there, and
 * appending filter bookkeeping to it would only bury the failure.
 */
export function annotateResult<T extends { success: boolean; data?: unknown }>(
  result: T,
  appliedDefaultFilters: FilterClause[],
  sorting: { sort: Array<{ field: string; direction: string }>; fromDefault: boolean },
  unappliedFilters: UnappliedClause[],
  unappliedSort: UnappliedClause[],
): T {
  if (!result.success || !result.data) return result;

  const annotations = describeAppliedConfig(appliedDefaultFilters, sorting, unappliedFilters, unappliedSort);
  if (Object.keys(annotations).length === 0) return result;

  return {
    ...result,
    data: { ...(result.data as Record<string, unknown>), ...annotations },
  };
}
