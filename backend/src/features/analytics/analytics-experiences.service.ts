// src/features/analytics/analytics-experiences.service.ts

/**
 * The experiences analytics can be scoped to: names only, for the experience picker. Served
 * under analytics:view, so a role that reads analytics needn't be able to view experience
 * configurations (or their access tokens).
 */

import 'server-only';

import { asc } from 'drizzle-orm';

import { db } from '@/db/index';
import { aiExperiences } from '@/db/schema/ai-experience.schema';
import { searchExperiences } from '@/db/schema/search-experience.schema';

export interface AnalyticsExperienceOption {
  id: string;
  name: string;
  slug: string;
  type: 'ai' | 'search';
  isActive: boolean;
}

/** AI experiences, then search experiences, each by name (inactive ones too: they can have history). */
export async function listAnalyticsExperiences(): Promise<AnalyticsExperienceOption[]> {
  const pick = { id: aiExperiences.id, name: aiExperiences.name, slug: aiExperiences.slug, isActive: aiExperiences.isActive };
  const [ai, search] = await Promise.all([
    db.select(pick).from(aiExperiences).orderBy(asc(aiExperiences.name)),
    db
      .select({ id: searchExperiences.id, name: searchExperiences.name, slug: searchExperiences.slug, isActive: searchExperiences.isActive })
      .from(searchExperiences)
      .orderBy(asc(searchExperiences.name)),
  ]);
  return [
    ...ai.map((e) => ({ ...e, slug: e.slug ?? '', isActive: e.isActive !== false, type: 'ai' as const })),
    ...search.map((e) => ({ ...e, slug: e.slug ?? '', isActive: e.isActive !== false, type: 'search' as const })),
  ];
}
