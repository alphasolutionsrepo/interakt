// app/analytics/_lib/experience-options.ts

import { EXPERIENCE_TYPE_AREA, type Area } from '@/features/feature-switches/areas';
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

/** Only the experiences whose area is on (chat experiences need Chat, search ones Search) */
export function experiencesWithAreaOn(experiences: ExperienceOption[], areaOn: (area: Area) => boolean): ExperienceOption[] {
  return experiences.filter((e) => areaOn(EXPERIENCE_TYPE_AREA[e.type]));
}

export type SelectionChange =
  | { kind: 'keep' }
  | { kind: 'reset' }
  | { kind: 'fill'; id: string; name: string; type: ExperienceOption['type'] };

/**
 * What to do with the selected experience once the list and access have answered: a type
 * whose area is off resets to All Experiences (also for a restored Ask conversation, even
 * one that keeps a deleted scope); a missing one resets only when the list is complete and
 * the scope is not kept; a known one gets its name and type filled in. Nothing while loading.
 */
export function selectionChange(input: {
  selected: { id?: string; name?: string; type?: ExperienceOption['type'] };
  experiences: ExperienceOption[];
  areaOn: (area: Area) => boolean;
  loading: boolean;
  complete: boolean;
  keepWhenMissing: boolean;
}): SelectionChange {
  const { selected, experiences, areaOn, loading, complete, keepWhenMissing } = input;
  if (loading || !selected.id) return { kind: 'keep' };
  const found = experiences.find((e) => e.id === selected.id);
  if (found && !areaOn(EXPERIENCE_TYPE_AREA[found.type])) return { kind: 'reset' };
  if (!found) return complete && !keepWhenMissing ? { kind: 'reset' } : { kind: 'keep' };
  if (found.name !== selected.name || found.type !== selected.type) return { kind: 'fill', id: found.id, name: found.name, type: found.type };
  return { kind: 'keep' };
}
