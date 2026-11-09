// app/api/roles/[id]/route.ts

/**
 * PUT    /api/roles/:id - rename a role or change its permissions
 * DELETE /api/roles/:id - delete a role nobody holds
 */

import { handleDeleteRole, handleUpdateRole } from '@/features/access/access.api.handlers';
import { withPermission } from '@/features/access/route-guard';

export const PUT = withPermission('users:manage', handleUpdateRole);
export const DELETE = withPermission('users:manage', handleDeleteRole);
