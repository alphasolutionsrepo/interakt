// src/features/access/roles.service.race.test.ts

/** A role deleted by someone else between reading and saving it answers 404, not a save. */

import { describe, expect, it, vi } from 'vitest';

vi.mock('./roles.repository', () => ({
  listRoles: async () => [],
  getRole: async (id: string) => ({ id, name: 'Old', isBuiltIn: false, permissions: [] }),
  roleNameTaken: async () => false,
  // The UPDATE matched no row: the role is gone
  updateRole: async () => undefined,
}));

import { ADMIN_ACCESS } from '@/shared/test/access-stub';

import { updateRole } from './roles.service';

describe('saving a role that was just deleted', () => {
  it('answers 404 instead of reporting a save', async () => {
    await expect(updateRole(ADMIN_ACCESS, 'r1', { name: 'New' })).rejects.toMatchObject({ status: 404 });
  });
});
