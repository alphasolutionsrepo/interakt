// app/settings/features/_lib/feature-toggle.ts

/**
 * What happens when an Admin flips a switch on Settings → Features, and after the save.
 * Pure (no React), so the page stays thin and the rules are tested on their own.
 */

import { dependentsToAsk, updateBody, type FeatureRow, type UpdateBody } from './feature-rows';

import type { Area } from '@/features/feature-switches/areas';
import { accessKeys } from '@/shared/access/useAccess';
import { errorText } from '@/shared/api/api-error';

export const featureKeys = { all: ['settings', 'features'] as const };

export interface Asking {
  id: Area;
  dependents: Area[];
}

export type ToggleDecision = { ask: Asking } | { save: UpdateBody };

/** Switching an area off that others need only it for: ask. Anything else: save it straight away. */
export function decideToggle(rows: readonly FeatureRow[], id: Area, next: boolean): ToggleDecision {
  const dependents = dependentsToAsk(id, next, rows);
  return dependents.length > 0 ? { ask: { id, dependents } } : { save: updateBody(id, next) };
}

export type DialogChoice = 'cancel' | 'only' | 'both';

/** The PUT body for the dialog's answer, or null when nothing is to be saved. */
export function bodyForChoice(asking: Asking | null, choice: DialogChoice): UpdateBody | null {
  if (!asking || choice === 'cancel') return null;
  return updateBody(asking.id, false, choice === 'both' ? asking.dependents : []);
}

/** Query keys to refresh after a save: the list itself, and the menu (it follows what is on). */
export function keysToInvalidate() {
  return [featureKeys.all, accessKeys.mine];
}

export function invalidateAfterSave(queryClient: { invalidateQueries: (f: { queryKey: readonly unknown[] }) => unknown }) {
  for (const queryKey of keysToInvalidate()) queryClient.invalidateQueries({ queryKey });
}

export const saveErrorText = (error: unknown) => errorText(error, 'Could not save the change');
