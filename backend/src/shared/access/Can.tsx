// src/shared/access/Can.tsx

/**
 * Show a control or a link only to a user who can use it. The server refuses the request
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
import { holdsAny, type Permission } from '@/features/access/permissions';
import type { UiActionId } from '@/features/access/ui-actions';

type CanProps = {
  children: ReactNode;
  fallback?: ReactNode;
} & (
  /** A UI action (ui-actions.ts): the usual case, so the control follows the server's rule */
  | { action: UiActionId; permission?: never }
  /** A permission (any one, when a list), for what isn't a single API call, such as a section */
  | { permission: Permission | readonly Permission[]; action?: never }
);

/** Renders its children only for a user who may take the action or holds the permission; `fallback` otherwise. */
export function Can({ children, fallback = null, ...rule }: CanProps) {
  const { can, canDo } = useAccess();
  const allowed = rule.action ? canDo(rule.action) : holdsAny(can, rule.permission);
  return <>{allowed ? children : fallback}</>;
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
