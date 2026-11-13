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
import type { Area } from '@/features/feature-switches/areas';

interface CanProps {
  children: ReactNode;
  fallback?: ReactNode;
  /** A UI action (ui-actions.ts), so the section follows the server's rule */
  action?: UiActionId;
  /** Or a permission (any one, when a list), for a section that isn't one API call */
  permission?: Permission | readonly Permission[];
  /** A feature area (feature-switches): the section shows only while it is on, with or without a rule above */
  area?: Area;
}

/** Renders its children only for a user who may take the action or holds the permission; `fallback` otherwise. */
export function Can({ children, fallback = null, area, ...rule }: CanProps) {
  const { can, canDo, areaOn, isLoading } = useAccess();
  // Neither the section nor its fallback while loading: a "no permission" note must not flash
  if (isLoading) return null;
  const hasRule = !!rule.action || !!rule.permission;
  const ruleAllows = rule.action ? canDo(rule.action) : !!rule.permission && holdsAny(can, rule.permission);
  const allowed = (hasRule ? ruleAllows : area !== undefined) && (area === undefined || areaOn(area));
  return <>{allowed ? children : fallback}</>;
}

/**
 * A link that hides itself when the page it points to is closed to the role (page-permissions.ts) or its area is off,
 * so nobody follows a link to "You don't have access to this page". `fallback` renders instead;
 * `plain` keeps the content (a name, a card) as an ordinary span or div, without hover styles.
 */
export function AccessLink({ fallback = null, plain, ...props }: ComponentProps<typeof Link> & { fallback?: ReactNode; plain?: 'span' | 'div' }) {
  const canOpen = useCanOpenPage();
  const path = typeof props.href === 'string' ? props.href : (props.href.pathname ?? '');
  if (canOpen(path)) return <Link {...props} />;
  if (!plain) return <>{fallback}</>;
  const Tag = plain;
  const className = props.className?.split(/\s+/).filter((c) => !c.startsWith('hover:') && !c.startsWith('group-hover:')).join(' ');
  return <Tag className={className}>{props.children as ReactNode}</Tag>;
}

/** Whether the user can open a page (query and hash ignored; its feature areas on), for a link AccessLink can't wrap. */
export function useCanOpenPage(): (href: string) => boolean {
  const { can, areaOn } = useAccess();
  return (href) => canOpenPage(href.split(/[?#]/)[0], can, areaOn);
}
