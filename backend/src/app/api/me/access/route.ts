// app/api/me/access/route.ts

/** GET /api/me/access - the signed-in user's role and permissions */

import { handleGetMyAccess } from '@/features/access/access.api.handlers';
import { SIGNED_IN, withPermission } from '@/features/access/route-guard';

export const GET = withPermission(SIGNED_IN, handleGetMyAccess);
