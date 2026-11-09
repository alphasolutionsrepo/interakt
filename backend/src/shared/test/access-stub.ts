// src/shared/test/access-stub.ts

/**
 * For route tests about something other than access: sign the caller in as an Admin while the
 * real permission gate (features/access/route-guard.ts) still runs. Stubs only its two I/O
 * points, the session and the database read of the user's role:
 *
 *   vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
 *   vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);
 *
 * accessStub.session / accessStub.access change who is calling for one test. Access itself is
 * tested against a real database in features/access/*.test.ts.
 */

import { ADMIN_ROLE_ID, ALL_PERMISSIONS } from '@/features/access/permissions';
import type { UserAccess } from '@/features/access/user-access';

export const ADMIN_ACCESS: UserAccess = {
  userId: 'admin',
  roleId: ADMIN_ROLE_ID,
  roleName: 'Admin',
  isAdmin: true,
  permissions: new Set(ALL_PERMISSIONS),
};

export const accessStub: {
  session: { user: { id: string } } | null;
  access: UserAccess | null;
  /** When set, the role lookup throws it (the database is down) */
  error: Error | null;
  reset(): void;
} = {
  session: { user: { id: 'admin' } },
  access: ADMIN_ACCESS,
  error: null,
  reset() {
    this.session = { user: { id: 'admin' } };
    this.access = ADMIN_ACCESS;
    this.error = null;
  },
};

export const signedInAuth = { auth: async () => accessStub.session };

export const accessService = {
  resolveAccess: async () => {
    if (accessStub.error) throw accessStub.error;
    return accessStub.access;
  },
};
