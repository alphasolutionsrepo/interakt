// src/features/access/access-tokens.ts

/**
 * An experience's access token lets anyone call its public routes (and spend AI tokens), so
 * the admin API gives it only to roles that may edit that kind of experience. Others get the
 * experience without it.
 */

import 'server-only';

import type { Permission } from './permissions';
import { checkAccess, SIGNED_IN } from './route-guard';
import { can } from './user-access';

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(([k]) => k !== 'accessToken').map(([k, v]) => [k, strip(v)]),
    );
  }
  return value;
}

/** The experience(s) as the caller may see them: without access tokens unless they hold `editPermission`. */
export async function tokensFor<T>(value: T, editPermission: Permission): Promise<T> {
  const { access } = await checkAccess(SIGNED_IN);
  return access && can(access, editPermission) ? value : (strip(value) as T);
}
