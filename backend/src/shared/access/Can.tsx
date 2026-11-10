// src/shared/access/Can.tsx

/**
 * Hiding what a user can't open: a whole section (Can) or a link to a page closed to them
 * (AccessLink). Actions on a page they can see are not hidden but locked, with the reason:
 * use ActionButton / ActionMenuItem / ActionSwitch (ActionControls.tsx) for those.
 *
 * Nothing shows while access is loading, so a section never flashes in and then disappears.
 * The server refuses the requests either way.
 */

'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import { useAccess } from './useAccess';

import { canOpenPage } from '@/features/access/page-permissions';
import { holdsAny, type Permission } from '@/features/access/permissions';
import type { UiActionId } from '@/features/access/ui-actions';

interface CanProps {
  children: ReactNode;
  fallback?: ReactNode;
  /** A UI action (ui-actions.ts), so the section follows the server's rule */
  action?: UiActionId;
  /** Or a permission (any one, when a list), for a section that isn't one API call */
  permission?: Permission | readonly Permission[];
}

/** Renders its children only for a user who may take the action or holds the permission; `fallback` otherwise. */
export function Can({ children, fallback = null, ...rule }: CanProps) {
  const { can, canDo } = useAccess();
  const allowed = rule.action ? canDo(rule.action) : !!rule.permission && holdsAny(can, rule.permission);
  return <>{allowed ? children : fallback}</>;
}

/**
 * A link that hides itself when the page it points to is closed to the role (page-permissions.ts),
 * so nobody follows a link to "You don't have access to this page". `fallback` renders instead,
 * for example the same label as plain text.
 */
export function AccessLink({ fallback = null, ...props }: ComponentProps<typeof Link> & { fallback?: ReactNode }) {
  const canOpen = useCanOpenPage();
  const path = typeof props.href === 'string' ? props.href : (props.href.pathname ?? '');
  return canOpen(path) ? <Link {...props} /> : <>{fallback}</>;
}

/** Whether the user can open a page (query and hash ignored), for a link AccessLink can't wrap. */
export function useCanOpenPage(): (href: string) => boolean {
  const { can } = useAccess();
  return (href) => canOpenPage(href.split(/[?#]/)[0], can);
}
