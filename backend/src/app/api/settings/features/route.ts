// app/api/settings/features/route.ts

/**
 * GET /api/settings/features - every area and whether it is on (anyone signed in)
 * PUT /api/settings/features - switch areas on or off: { areas: { chat: false } } (Admin only)
 */

import { SIGNED_IN, withPermission } from '@/features/access/route-guard';
import {
  handleListFeatureSwitches,
  handleUpdateFeatureSwitches,
} from '@/features/feature-switches/feature-switches.api.handlers';

export const GET = withPermission(SIGNED_IN, handleListFeatureSwitches);
export const PUT = withPermission('settings:manage', handleUpdateFeatureSwitches);
