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
import { AREA_IDS, type Area } from '@/features/feature-switches/areas';
import { areaOnFor } from '@/shared/access/access-state';

const held = new Set<Permission>();
let admin = false;
let loading = false;
const areasOffSet = new Set<Area>();
let reasons: { pinnedOff?: Area[]; switchedOff?: Area[] } = {};

export const uiAccess = {
  /** Render as a user holding exactly these permissions (not an Admin) */
  hold(...permissions: Permission[]) {
    held.clear();
    permissions.forEach((p) => held.add(p));
    admin = false;
    loading = false;
    areasOffSet.clear();
    reasons = {};
  },
  /**
   * Turn areas off the way the server reports why: `switchedOff` by an Admin, `pinnedOff` by the
   * deployment setting. `off` (everything else) is off only because what it needs is off.
   * Without this, areasOff answers as an older server does: no reasons.
   */
  areasOffBecause({ switchedOff = [], pinnedOff = [], off = [] }: { switchedOff?: Area[]; pinnedOff?: Area[]; off?: Area[] }) {
    [...switchedOff, ...pinnedOff, ...off].forEach((a) => areasOffSet.add(a));
    reasons = { pinnedOff, switchedOff };
  },
  /** Turn these feature areas off (after hold / asAdmin, which turn every area back on) */
  areasOff(...areas: Area[]) {
    areas.forEach((a) => areasOffSet.add(a));
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
  areasOffSet.clear();
  reasons = {};
}

const can = (p: Permission) => held.has(p);

export const useAccessModule = {
  accessKeys: { mine: ['access', 'mine'] as const },
  useAccess: () => ({
    // What /api/me/access would answer for these permissions
    access: loading ? undefined : {
      userId: 'me',
      role: { id: 'role', name: admin ? 'Admin' : 'Test role', isAdmin: admin },
      permissions: [...held],
      areas: AREA_IDS.filter((a) => !areasOffSet.has(a)),
      ...reasons,
    },
    isLoading: loading,
    errorStatus: null,
    retry: () => {},
    can,
    // The real rule, fed the same answer /api/me/access would give
    areaOn: areaOnFor({ isLoading: loading, errorStatus: null, areas: loading ? undefined : AREA_IDS.filter((a) => !areasOffSet.has(a)) }),
    canDo: (action: UiActionId) => allowsAction(can, action),
    isAdmin: admin,
  }),
};
