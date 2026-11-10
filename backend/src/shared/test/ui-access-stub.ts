// src/shared/test/ui-access-stub.ts

/**
 * For component tests about what a user sees: render as someone holding a chosen set of
 * permissions, with the real UI action rules (ui-actions.ts) applied.
 *
 *   vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
 *   uiAccess.hold('ai-providers:view');        // before rendering
 *
 * Tests name permissions, never roles: what a role holds is the server's business, and a
 * user's permissions may come from more than one role.
 */

import { ALL_PERMISSIONS, type Permission } from '@/features/access/permissions';
import { allowsAction, type UiActionId } from '@/features/access/ui-actions';

const held = new Set<Permission>();
let admin = false;
let loading = false;

export const uiAccess = {
  /** Render as a user holding exactly these permissions (not an Admin) */
  hold(...permissions: Permission[]) {
    held.clear();
    permissions.forEach((p) => held.add(p));
    admin = false;
    loading = false;
  },
  /** Render as an Admin (every permission) */
  asAdmin() {
    this.hold(...ALL_PERMISSIONS);
    admin = true;
  },
};

/** Render as if the access lookup hasn't answered yet (until the next hold / asAdmin) */
export function uiAccessLoading() {
  held.clear();
  admin = false;
  loading = true;
}

const can = (p: Permission) => held.has(p);

export const useAccessModule = {
  accessKeys: { mine: ['access', 'mine'] as const },
  useAccess: () => ({
    access: undefined,
    isLoading: loading,
    errorStatus: null,
    retry: () => {},
    can,
    canDo: (action: UiActionId) => allowsAction(can, action),
    isAdmin: admin,
  }),
};
