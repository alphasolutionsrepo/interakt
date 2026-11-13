// src/features/dashboard/home.api.handlers.ts

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { CHECKLIST_ID, getHomeData, homeDataForRole, invalidateHomeCache, TIP_ID } from './home.service';

import type { Permission } from '@/features/access/permissions';
import { can } from '@/features/access/user-access';
import { checkAccess, SIGNED_IN } from '@/features/access/route-guard';
import { isAreaOn } from '@/features/feature-switches/feature-switches.service';
import { turnedOff } from '@/features/feature-switches/gate';
import { dismissTip } from '@/features/analytics/analytics-insights.service';
import { isValidTimeZone } from '@/features/analytics/analytics-period';
import { apiResponse } from '@/shared/api/response';
import { getCurrentUserId } from '@/shared/utils/auth-utils';

/** GET /api/dashboard/home?tz=Europe/Copenhagen — everything the home page shows */
export async function handleGetHome(request: NextRequest) {
  const tz = request.nextUrl.searchParams.get('tz') ?? 'UTC';
  if (!isValidTimeZone(tz)) return apiResponse.badRequest(`Unknown time zone: ${tz}`);
  try {
    const { access, response } = await checkAccess(SIGNED_IN);
    if (response) return response;
    // With Analytics off the home page shows no analytics figures, cards or tips, whoever asks
    const analyticsOn = await isAreaOn('analytics');
    const holds = (p: Permission) => can(access, p) && (analyticsOn || !p.startsWith('analytics:'));
    return NextResponse.json({ success: true, data: homeDataForRole(await getHomeData(tz, analyticsOn), holds, { analyticsOn }) });
  } catch (error) {
    return apiResponse.error('Failed to load the home page', 500, { operation: 'getHome', err: error });
  }
}

const dismissSchema = z.object({ tipId: z.string().regex(TIP_ID) });

/**
 * POST /api/dashboard/home/tips { tipId } — dismiss a tip for good, for everyone (route:
 * analytics:manage). The tips are analytics tips, refused with Analytics off; hiding the setup
 * checklist (stored the same way) is not.
 */
export async function handleDismissTip(request: NextRequest) {
  if (!(await getCurrentUserId())) return apiResponse.unauthorized('You must be logged in');
  const parsed = dismissSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiResponse.badRequest('A valid tipId is required');
  try {
    if (parsed.data.tipId !== CHECKLIST_ID && !(await isAreaOn('analytics'))) return turnedOff();
    await dismissTip(parsed.data.tipId);
    invalidateHomeCache();
    return NextResponse.json({ success: true, data: { tipId: parsed.data.tipId } });
  } catch (error) {
    return apiResponse.error('Failed to dismiss the tip', 500, { operation: 'dismissTip', err: error });
  }
}
