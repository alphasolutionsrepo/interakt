// src/features/dashboard/home.api.handlers.ts

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getHomeData, homeDataForRole, invalidateHomeCache, TIP_ID } from './home.service';

import { can } from '@/features/access/access.service';
import { checkAccess, SIGNED_IN } from '@/features/access/route-guard';
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
    return NextResponse.json({ success: true, data: homeDataForRole(await getHomeData(tz), (p) => can(access, p)) });
  } catch (error) {
    return apiResponse.error('Failed to load the home page', 500, { operation: 'getHome', err: error });
  }
}

const dismissSchema = z.object({ tipId: z.string().regex(TIP_ID) });

/** POST /api/dashboard/home/tips { tipId } — dismiss a tip for good, for everyone (route: analytics:manage) */
export async function handleDismissTip(request: NextRequest) {
  if (!(await getCurrentUserId())) return apiResponse.unauthorized('You must be logged in');
  const parsed = dismissSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiResponse.badRequest('A valid tipId is required');
  try {
    await dismissTip(parsed.data.tipId);
    invalidateHomeCache();
    return NextResponse.json({ success: true, data: { tipId: parsed.data.tipId } });
  } catch (error) {
    return apiResponse.error('Failed to dismiss the tip', 500, { operation: 'dismissTip', err: error });
  }
}
