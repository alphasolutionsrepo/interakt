// app/analytics/_lib/experience-options.ts

import { aiExperiencesApi } from '@/app/ai-experiences/_lib/api-client';
import { searchExperiencesApi } from '@/app/search-experiences/_lib/api-client';

export interface ExperienceOption {
  id: string;
  name: string;
  slug: string;
  type: 'ai' | 'search';
  isActive: boolean;
}

export interface ExperienceOptions {
  experiences: ExperienceOption[];
  /** False when either list failed to load: a missing experience may then just be unloaded */
  complete: boolean;
  /** Why a list failed to load */
  errors: unknown[];
}

/**
 * The experiences analytics can be scoped to, AI then search (inactive ones too: they
 * can still have historical data). One list failing still returns the other.
 */
export async function loadExperienceOptions(): Promise<ExperienceOptions> {
  const [ai, search] = await Promise.allSettled([
    aiExperiencesApi.list({ page: 1, pageSize: 100 }),
    searchExperiencesApi.list({ pageSize: 100 }),
  ]);
  const experiences: ExperienceOption[] = [];
  const add = (type: ExperienceOption['type'], list: Array<{ id: string; name: string; slug?: string | null; isActive?: boolean }>) => {
    for (const exp of list) {
      if (exp.id && exp.name) experiences.push({ id: exp.id, name: exp.name, slug: exp.slug || '', type, isActive: exp.isActive !== false });
    }
  };
  if (ai.status === 'fulfilled') add('ai', ai.value.experiences);
  if (search.status === 'fulfilled') add('search', search.value.items);
  const errors = [ai, search].flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
  return { experiences, complete: errors.length === 0, errors };
}
