// src/shared/seeders/docs/built-in-help.ts

/**
 * Whether an experience is one of the built-in help experiences (the help assistant and the
 * docs search) that every signed-in user may use from the admin. Decided by the slug AND the
 * seed registry: the docs setup created it. An experience someone made under the same slug
 * without the setup isn't built in.
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

export async function isBuiltInHelpExperience(slug: string | undefined): Promise<boolean> {
  const key = slug !== undefined ? SEED_KEY_BY_SLUG[slug] : undefined;
  if (!key) return false;
  return (await getRegistryEntry(SEED_TYPES.DOCS, key)) !== null;
}
