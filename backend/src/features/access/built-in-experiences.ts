// src/features/access/built-in-experiences.ts

/**
 * The built-in help experiences (the Help Assistant and docs search the docs setup made) are
 * open to every signed-in user, so only an Admin may change them: a role that edits
 * experiences could otherwise attach a tool or an index to them and reach it through the help.
 */

import 'server-only';

import { checkAccess, SIGNED_IN, withPermission } from './route-guard';

import { getAIExperienceById } from '@/features/ai-experience/ai-experience.repository';
import { getSearchExperienceById } from '@/features/search-experience/search-experience.repository';
import { apiResponse } from '@/shared/api/response';

type Kind = 'ai' | 'search';

export const GUARDS_BUILT_IN_EXPERIENCES = Symbol.for('interakt.guardsBuiltInExperiences');

async function isBuiltIn(kind: Kind, id: string): Promise<boolean> {
  const experience = kind === 'ai' ? await getAIExperienceById(id) : await getSearchExperienceById(id);
  return experience?.isBuiltIn === true;
}

/**
 * The gate for every route that changes an experience (`/api/{ai,search}-experiences/[id]/…`):
 * the kind's edit permission, and Admin for a built-in one. Every such route uses this
 * (routes.access.test).
 */
export function forExperienceChange<A extends [unknown, { params: Promise<{ id: string }> }, ...unknown[]]>(
  kind: Kind,
  handler: (...args: A) => Response | Promise<Response>,
) {
  const route = withPermission(kind === 'ai' ? 'ai-experiences:edit' : 'search-experiences:edit', async (...args: A): Promise<Response> => {
    const { id } = await args[1].params;
    const { access } = await checkAccess(SIGNED_IN);
    if (!access?.isAdmin) {
      let builtIn: boolean;
      try {
        builtIn = await isBuiltIn(kind, id);
      } catch (error) {
        // Can't tell (database down): answer and log it like any API error, change nothing
        return apiResponse.error(error, 500, { operation: 'checkBuiltInExperience' });
      }
      if (builtIn) return apiResponse.forbidden('Only an Admin can change the built-in help');
    }
    return handler(...args);
  });
  Object.defineProperty(route, GUARDS_BUILT_IN_EXPERIENCES, { value: true });
  return route;
}
