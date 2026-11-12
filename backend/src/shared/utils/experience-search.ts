// src/shared/utils/experience-search.ts

import { ilike, or, type AnyColumn } from 'drizzle-orm';

import { escapeLikePattern } from './like-pattern';

/**
 * The one rule for the experiences search box: a case-insensitive "contains" (a % or _ typed in the box matches itself) on the name, the
 * slug or the description. Chat and search experiences both list through it, so the hub's
 * cards add up two numbers that were filtered the same way.
 */
export function matchesExperienceSearch(
  columns: { name: AnyColumn; slug: AnyColumn; description: AnyColumn },
  search: string
) {
  const pattern = `%${escapeLikePattern(search)}%`;
  return or(ilike(columns.name, pattern), ilike(columns.slug, pattern), ilike(columns.description, pattern));
}
