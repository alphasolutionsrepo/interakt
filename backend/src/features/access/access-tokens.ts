// src/features/access/access-tokens.ts

/**
 * An experience's access token lets anyone call its public routes (and spend AI tokens), so
 * the admin API gives it only to roles that may edit that kind of experience or use the
 * playgrounds (which call those routes with it, and may spend AI tokens anyway). Others get the
 * experience without it.
 */

import 'server-only';

import type { Permission } from './permissions';
import { withoutFields } from './redact';
import { checkAccess, SIGNED_IN } from './route-guard';
import { can } from './user-access';

const TOKEN_FIELDS: ReadonlySet<string> = new Set(['accessToken']);

/** The experience(s) as the caller may see them: without access tokens unless they hold `editPermission` or `playground:use`. */
export async function tokensFor<T>(value: T, editPermission: Permission): Promise<T> {
  const { access } = await checkAccess(SIGNED_IN);
  const keeps = access && (can(access, editPermission) || can(access, 'playground:use'));
  return keeps ? value : withoutFields(value, TOKEN_FIELDS);
}
