// app/api/roles/route.ts

/**
 * GET  /api/roles - list roles with how many users hold each
 * POST /api/roles - create a role
 */

import { handleCreateRole, handleListRoles } from '@/features/access/access.api.handlers';
import { withPermission } from '@/features/access/route-guard';

export const GET = withPermission('users:manage', handleListRoles);
export const POST = withPermission('users:manage', handleCreateRole);
