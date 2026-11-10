// src/shared/access/Can.tsx

/**
 * Show a control or a link only to a role that can use it. The server refuses the request
 * either way; this keeps the admin UI from offering what would fail (a form the server will
 * refuse, a button that only shows an error).
 *
 * Nothing shows while access is loading, so an option never flashes in and then disappears.
 */

'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import { useAccess } from './useAccess';

import { canOpenPage } from '@/features/access/page-permissions';
import type { Permission } from '@/features/access/permissions';

/** True when the role holds the permission, or any one of a list of them. */
export function holdsAny(can: (p: Permission) => boolean, permission: Permission | readonly Permission[]): boolean {
  const needed = typeof permission === 'string' ? [permission] : permission;
  return needed.some(can);
}

/** Renders its children only for a role holding `permission` (any one, when a list); `fallback` otherwise. */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission | readonly Permission[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useAccess();
  return <>{holdsAny(can, permission) ? children : fallback}</>;
}

/**
 * A link that hides itself when the page it points to is closed to the role (page-permissions.ts),
 * so nobody follows a link to "You don't have access to this page". `fallback` renders instead,
 * for example the same label as plain text.
 */
export function AccessLink({ fallback = null, ...props }: ComponentProps<typeof Link> & { fallback?: ReactNode }) {
  const { can } = useAccess();
  const path = typeof props.href === 'string' ? props.href : (props.href.pathname ?? '');
  return canOpenPage(path.split(/[?#]/)[0], can) ? <Link {...props} /> : <>{fallback}</>;
}
