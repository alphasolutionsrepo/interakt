// src/shared/utils/experience-search.ts

import { ilike, or, type AnyColumn } from 'drizzle-orm';

/**
 * The one rule for the experiences search box: a case-insensitive "contains" on the name, the
 * slug or the description. Chat and search experiences both list through it, so the hub's
 * cards add up two numbers that were filtered the same way.
 */
export function matchesExperienceSearch(
  columns: { name: AnyColumn; slug: AnyColumn; description: AnyColumn },
  search: string
) {
  const pattern = `%${search}%`;
  return or(ilike(columns.name, pattern), ilike(columns.slug, pattern), ilike(columns.description, pattern));
}
