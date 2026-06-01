// src/features/tools/executors/sort-clause.util.ts

/**
 * Sort clause parsing for search tool inputs.
 *
 * AI-generated tool arguments express sort in a variety of free-form shapes,
 * e.g. "publishDate desc", "publishDate:desc", "publishDate", "price asc, name desc",
 * or the structured array form [{ field, direction }]. This util normalizes all of
 * them into provider-agnostic SortClause[] so downstream query builders never receive
 * a field name with an embedded direction (which previously produced malformed
 * expressions like "publishDate desc asc").
 */

import type { SortClause } from '@/features/search/search.types';

type SortInput = string | Array<{ field: string; direction?: 'asc' | 'desc' }>;

const DEFAULT_DIRECTION: SortClause['direction'] = 'asc';

/** Normalize a direction token to 'asc' | 'desc', falling back to the default. */
function normalizeDirection(direction?: string): SortClause['direction'] {
  return direction?.trim().toLowerCase() === 'desc' ? 'desc' : DEFAULT_DIRECTION;
}

/**
 * Parse a single sort expression such as "publishDate", "publishDate desc",
 * or "publishDate:desc" into a SortClause. Returns null when no usable field
 * token is present.
 */
function parseSortExpression(expression: string): SortClause | null {
  // Split on whitespace and/or colon so "field dir" and "field:dir" both work.
  const tokens = expression.trim().split(/[\s:]+/).filter(Boolean);
  if (tokens.length === 0) return null;

  return {
    field: tokens[0],
    direction: normalizeDirection(tokens[1]),
  };
}

/** Convert any supported sort input shape into normalized SortClause[]. */
export function parseSortInput(sort?: SortInput): SortClause[] {
  if (!sort) return [];

  if (Array.isArray(sort)) {
    const clauses: SortClause[] = [];
    for (const entry of sort) {
      const parsed = parseSortExpression(entry?.field ?? '');
      if (!parsed) continue;
      // Honor an explicit object-level direction only when the field token
      // itself didn't already carry one (e.g. field: "publishDate desc").
      const fieldHadDirection = /[\s:]+(asc|desc)\b/i.test((entry?.field ?? '').trim());
      if (entry?.direction && !fieldHadDirection) {
        parsed.direction = normalizeDirection(entry.direction);
      }
      clauses.push(parsed);
    }
    return clauses;
  }

  // String form may hold several comma-separated clauses.
  return sort
    .split(',')
    .map(parseSortExpression)
    .filter((clause): clause is SortClause => clause !== null);
}
