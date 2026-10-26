// src/features/dashboard/home.api.handlers.ts

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getHomeData, invalidateHomeCache, TIP_ID } from './home.service';

import { dismissTip } from '@/features/analytics/analytics-insights.service';
import { isValidTimeZone } from '@/features/analytics/analytics-period';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';


const logger = createLogger('home-api');

/** GET /api/dashboard/home?tz=Europe/Copenhagen — everything the home page shows */
export async function handleGetHome(request: NextRequest) {
  if (!(await getCurrentUserId())) return apiResponse.unauthorized('You must be logged in');
  const tz = request.nextUrl.searchParams.get('tz') ?? 'UTC';
  if (!isValidTimeZone(tz)) return apiResponse.badRequest(`Unknown time zone: ${tz}`);
  try {
    return NextResponse.json({ success: true, data: await getHomeData(tz) });
  } catch (error) {
    logger.error('Failed to build the home page', error as Error);
    return apiResponse.error('Failed to load the home page', 500);
  }
}

const dismissSchema = z.object({ tipId: z.string().regex(TIP_ID) });

/** POST /api/dashboard/home/tips { tipId } — dismiss a tip for good, for every admin */
export async function handleDismissTip(request: NextRequest) {
  if (!(await getCurrentUserId())) return apiResponse.unauthorized('You must be logged in');
  const parsed = dismissSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiResponse.badRequest('A valid tipId is required');
  try {
    await dismissTip(parsed.data.tipId);
    invalidateHomeCache();
    return NextResponse.json({ success: true, data: { tipId: parsed.data.tipId } });
  } catch (error) {
    logger.error('Failed to dismiss tip', error as Error);
    return apiResponse.error('Failed to dismiss the tip', 500);
  }
}
