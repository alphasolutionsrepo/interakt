// src/shared/seeders/docs/built-in-help.ts

/**
 * The built-in help experiences (the help assistant and the docs search) every signed-in user
 * may use from the admin. The docs setup records each experience's id in its seed registry
 * entry, and an experience is built in only when its id is the one recorded: one someone makes
 * later under the same slug, or without the setup, isn't.
 */

import 'server-only';

import { SEED_TYPES } from '@/db/schema/seed-registry.schema';
import {
  DOCS_SEARCH_SEED_KEY,
  DOCS_SEARCH_SLUG,
  DOCS_SEED_KEY,
  HELP_EXPERIENCE_SLUG,
} from '@/shared/help/help-content';
import { getRegistryEntry, upsertRegistryEntry } from '@/shared/seeders/seed-registry.service';

const SEED_KEY_BY_SLUG: Record<string, string> = {
  [DOCS_SEARCH_SLUG]: DOCS_SEARCH_SEED_KEY,
  [HELP_EXPERIENCE_SLUG]: DOCS_SEED_KEY,
};

function recordedId(metadata: unknown): string | undefined {
  const id = (metadata as { experienceId?: unknown } | null | undefined)?.experienceId;
  return typeof id === 'string' ? id : undefined;
}

export async function isBuiltInHelpExperience(experience: { slug?: string; id?: string }): Promise<boolean> {
  const key = experience.slug !== undefined ? SEED_KEY_BY_SLUG[experience.slug] : undefined;
  if (!key || !experience.id) return false;
  const entry = await getRegistryEntry(SEED_TYPES.DOCS, key);
  return !!entry && recordedId(entry.metadata) === experience.id;
}

/**
 * Record which experience a docs seed created. `onlyIfMissing` backfills an entry written
 * before ids were recorded, without letting a later run replace the id it already holds.
 */
export async function recordBuiltInExperience(
  key: typeof DOCS_SEED_KEY | typeof DOCS_SEARCH_SEED_KEY,
  experienceId: string,
  options: { onlyIfMissing?: boolean } = {},
): Promise<void> {
  const entry = await getRegistryEntry(SEED_TYPES.DOCS, key);
  if (!entry) return;
  if (options.onlyIfMissing && recordedId(entry.metadata)) return;
  const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
  await upsertRegistryEntry(SEED_TYPES.DOCS, key, entry.checksum, { ...metadata, experienceId });
}
