// app/analytics/_lib/experience-options.ts

import type { Area } from '@/features/feature-switches/areas';
import { handleApiResponse } from '@/shared/api/api-error';

export interface ExperienceOption {
  id: string;
  name: string;
  slug: string;
  type: 'ai' | 'search';
  isActive: boolean;
}

export interface ExperienceOptions {
  experiences: ExperienceOption[];
  /** False when the list failed to load: a missing experience may then just be unloaded */
  complete: boolean;
  /** Why the list failed to load */
  errors: unknown[];
}

/**
 * The experiences analytics can be scoped to, AI then search (inactive ones too: they can
 * still have historical data). Read from the analytics API, so roles that read analytics get
 * it without the experience permissions.
 */
export async function loadExperienceOptions(): Promise<ExperienceOptions> {
  try {
    const experiences = await handleApiResponse<ExperienceOption[]>(await fetch('/api/analytics/experiences'));
    return { experiences, complete: true, errors: [] };
  } catch (error) {
    return { experiences: [], complete: false, errors: [error] };
  }
}

/** The area an experience of each type belongs to */
export const EXPERIENCE_TYPE_AREA: Record<ExperienceOption['type'], Area> = { ai: 'chat', search: 'search' };

/** Only the experiences whose area is on (chat experiences need Chat, search ones Search) */
export function experiencesWithAreaOn(experiences: ExperienceOption[], areaOn: (area: Area) => boolean): ExperienceOption[] {
  return experiences.filter((e) => areaOn(EXPERIENCE_TYPE_AREA[e.type]));
}
