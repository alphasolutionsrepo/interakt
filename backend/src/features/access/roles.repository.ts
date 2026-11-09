// src/features/access/roles.repository.ts

/**
 * Database access for roles, and the user writes that can change who is an Admin.
 *
 * Changing a user's role or active flag goes through updateUserAccess, which locks the active
 * Admin rows in a transaction before checking that at least one stays. Two admins demoting
 * each other at the same moment can't both succeed.
 */

import 'server-only';

import { and, count, eq, ne } from 'drizzle-orm';

import { ADMIN_ROLE_ID } from './permissions';

import { db } from '@/db/index';
import { roles, type NewRole, type Role } from '@/db/schema/roles.schema';
import { user } from '@/db/schema/users.schema';
import { ConflictError } from '@/shared/errors/app-error';


export interface RoleWithUsage extends Role {
  userCount: number;
}

export async function listRoles(): Promise<RoleWithUsage[]> {
  const rows = await db
    .select({ role: roles, userCount: count(user.id) })
    .from(roles)
    .leftJoin(user, eq(user.roleId, roles.id))
    .groupBy(roles.id);
  // Built-in first, then by name
  return rows
    .map((r) => ({ ...r.role, userCount: Number(r.userCount) }))
    .sort((a, b) => Number(b.isBuiltIn) - Number(a.isBuiltIn) || a.name.localeCompare(b.name));
}

export async function getRole(id: string): Promise<Role | null> {
  const [row] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  return row ?? null;
}

export async function roleNameTaken(name: string, exceptId?: string): Promise<boolean> {
  const [row] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(exceptId ? and(eq(roles.name, name), ne(roles.id, exceptId)) : eq(roles.name, name))
    .limit(1);
  return !!row;
}

export async function createRole(values: Pick<NewRole, 'name' | 'description' | 'permissions'>): Promise<Role> {
  const [row] = await db.insert(roles).values({ ...values, isBuiltIn: false }).returning();
  return row;
}

export async function updateRole(
  id: string,
  values: Partial<Pick<NewRole, 'name' | 'description' | 'permissions'>>,
): Promise<Role> {
  const [row] = await db
    .update(roles)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(roles.id, id), eq(roles.isBuiltIn, false)))
    .returning();
  return row;
}

/** Deletes a role nobody holds. A role in use is refused (the foreign key restricts it too). */
export async function deleteRole(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(user).where(eq(user.roleId, id));
    if (Number(n) > 0) {
      throw new ConflictError(`This role is assigned to ${n} user(s). Give them another role first.`, {
        userCount: Number(n),
      });
    }
    await tx.delete(roles).where(and(eq(roles.id, id), eq(roles.isBuiltIn, false)));
  });
}

/**
 * Change a user's role and/or active flag, refusing a change that would leave no active Admin.
 * Returns false when the user doesn't exist.
 */
export async function updateUserAccess(
  userId: string,
  changes: { roleId?: string; isActive?: boolean },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Lock every active admin row so concurrent demotions are serialised.
    const admins = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.roleId, ADMIN_ROLE_ID), eq(user.isActive, true)))
      .for('update');

    const [target] = await tx.select().from(user).where(eq(user.id, userId)).limit(1);
    if (!target) return false;

    const wasActiveAdmin = target.roleId === ADMIN_ROLE_ID && target.isActive === true;
    const staysActiveAdmin =
      (changes.roleId ?? target.roleId) === ADMIN_ROLE_ID && (changes.isActive ?? target.isActive) === true;
    if (wasActiveAdmin && !staysActiveAdmin && admins.length <= 1) {
      throw new ConflictError('This is the last active Admin. Make another user an Admin first.');
    }

    await tx
      .update(user)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(user.id, userId));
    return true;
  });
}
