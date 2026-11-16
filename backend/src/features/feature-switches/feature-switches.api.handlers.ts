// src/features/feature-switches/feature-switches.api.handlers.ts

/**
 * GET /api/settings/features: every area with its state, for anyone signed in (the admin UI
 * hides what is off). PUT: switch areas on or off, Admin only (the route also needs
 * settings:manage).
 */

import 'server-only';

import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { AREA_IDS, type Area } from './areas';
import { listFeatureSwitches, setFeatureSwitches } from './feature-switches.service';

import { AccessDeniedError } from '@/features/access/access-policy';
import { checkAccess } from '@/features/access/route-guard';
import { readJsonBody } from '@/shared/api/read-json-body';
import { apiResponse } from '@/shared/api/response';

const updateSchema = z.object({
  areas: z
    .record(z.enum(AREA_IDS as [Area, ...Area[]]), z.boolean())
    .refine((areas) => Object.keys(areas).length > 0, 'Name at least one area to switch'),
}).strict();

export async function handleListFeatureSwitches() {
  try {
    return apiResponse.success({ areas: await listFeatureSwitches() });
  } catch (error) {
    return apiResponse.error(error, 500, { operation: 'listFeatureSwitches' });
  }
}

export async function handleUpdateFeatureSwitches(request: NextRequest) {
  try {
    const { access, response } = await checkAccess('settings:manage');
    if (response) return response;
    // The route guard only checks settings:manage, which other roles can hold; switching is Admin only.
    if (!access.isAdmin) throw new AccessDeniedError('Only an Admin can turn features on or off.');
    const parsed = updateSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) return apiResponse.validationError(parsed.error);
    return apiResponse.success({ areas: await setFeatureSwitches(parsed.data.areas as Partial<Record<Area, boolean>>, access.userId) });
  } catch (error) {
    return apiResponse.error(error, 500, { operation: 'updateFeatureSwitches' });
  }
}
