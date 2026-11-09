// src/shared/seeders/docs/built-in-help.ts

/**
 * Whether an experience is one of the built-in help experiences (the help assistant and the
 * docs search) that every signed-in user may use from the admin. Decided by the slug and the
 * seed registry: the docs setup recorded it, and the experience existed when it did (the setup
 * creates the experience, then writes the entry). An experience someone made under the same
 * slug later, or without the setup, isn't built in.
 */

import 'server-only';

import { SEED_TYPES } from '@/db/schema/seed-registry.schema';
import {
  DOCS_SEARCH_SEED_KEY,
  DOCS_SEARCH_SLUG,
  DOCS_SEED_KEY,
  HELP_EXPERIENCE_SLUG,
} from '@/shared/help/help-content';
import { getRegistryEntry } from '@/shared/seeders/seed-registry.service';

const SEED_KEY_BY_SLUG: Record<string, string> = {
  [DOCS_SEARCH_SLUG]: DOCS_SEARCH_SEED_KEY,
  [HELP_EXPERIENCE_SLUG]: DOCS_SEED_KEY,
};

export async function isBuiltInHelpExperience(experience: { slug?: string; createdAt?: Date | string | null }): Promise<boolean> {
  const key = experience.slug !== undefined ? SEED_KEY_BY_SLUG[experience.slug] : undefined;
  if (!key || !experience.createdAt) return false;
  const entry = await getRegistryEntry(SEED_TYPES.DOCS, key);
  return !!entry && new Date(experience.createdAt).getTime() <= new Date(entry.updatedAt).getTime();
}
