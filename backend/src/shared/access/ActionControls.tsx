// src/shared/access/ActionControls.tsx

/**
 * Controls that follow the user's permissions the same way everywhere in the admin:
 *
 *  - pages and sidebar links the user can't open are hidden (PageAccessGate, AccessLink);
 *  - actions on a page they can see stay visible but locked: disabled, a lock icon, and the
 *    reason on hover and for screen readers ("You don't have permission to ...");
 *  - values (switches, selects) keep showing their value, locked the same way.
 *
 * Every control names a UI action (features/access/ui-actions.ts), so it asks what the server
 * checks. While access is loading a control is disabled without the lock, so nothing flashes.
 * The server refuses the request either way; this is the UI being honest about it.
 */

'use client';

import { Lock, type LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { useAccess } from './useAccess';

import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BUILT_IN_REFUSAL } from '@/features/access/permissions';
import { lockReason, noPermissionTo, type UiActionId } from '@/features/access/ui-actions';

export type ActionGate = { state: 'loading' } | { state: 'allowed' } | { state: 'locked'; reason: string };

type AccessView = Pick<ReturnType<typeof useAccess>, 'isLoading' | 'canDo' | 'isAdmin'>;

/** The gate for a UI action, from what the user holds. Pure, so the rule is tested on its own. */
export function gateFor(access: AccessView, action: UiActionId): ActionGate {
  if (access.isLoading) return { state: 'loading' };
  return access.canDo(action) ? { state: 'allowed' } : { state: 'locked', reason: lockReason(action) };
}

/**
 * The gate for an action on a row that may be part of the built-in help: besides the action's
 * permission, only an Admin changes a built-in row (the server refuses everyone else).
 */
export function builtInGateFor(access: AccessView, action: UiActionId, isBuiltIn: boolean): ActionGate {
  const gate = gateFor(access, action);
  if (gate.state !== 'allowed' || !isBuiltIn || access.isAdmin) return gate;
  return { state: 'locked', reason: `${BUILT_IN_REFUSAL}.` };
}

/** Whether the user may take the action now, may not (and why), or it isn't known yet. */
export function useActionGate(action: UiActionId): ActionGate {
  return gateFor(useAccess(), action);
}

/** Allowed when any one of the actions is (New Experience: either kind); `does` names them together. */
export function anyActionGateFor(access: AccessView, actions: readonly UiActionId[], does: string): ActionGate {
  if (access.isLoading) return { state: 'loading' };
  return actions.some((a) => access.canDo(a))
    ? { state: 'allowed' }
    : { state: 'locked', reason: noPermissionTo(does) };
}

export function useAnyActionGate(actions: readonly UiActionId[], does: string): ActionGate {
  return anyActionGateFor(useAccess(), actions, does);
}

/** For the few Admin-only actions (shaping roles, changing the built-in help); `does` finishes "Only an Admin can ...". */
export function adminGateFor(access: AccessView, does: string): ActionGate {
  if (access.isLoading) return { state: 'loading' };
  return access.isAdmin ? { state: 'allowed' } : { state: 'locked', reason: `Only an Admin can ${does}.` };
}

export function useAdminGate(does: string): ActionGate {
  return adminGateFor(useAccess(), does);
}

/**
 * Shows why a control is locked, on hover and focus and to screen readers. A disabled control
 * gets no pointer events, so the reason sits on a focusable wrapper around it.
 */
export function LockedHint({ reason, block = false, children }: { reason: string; block?: boolean; children: ReactNode }) {
  return (
    // The wrapper is focusable, so keyboard users reach the reason too
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} data-locked="" className={block ? 'block cursor-not-allowed' : 'inline-flex cursor-not-allowed'}>
          {children}
          <span className="sr-only">{reason}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

const iconFor = (gate: ActionGate, Icon: LucideIcon | undefined, className: string) =>
  gate.state === 'locked' ? <Lock className={className} aria-hidden /> : Icon ? <Icon className={className} aria-hidden /> : null;

/** Either name the UI action, or pass a gate worked out another way (useAdminGate). */
type GateProps = ({ action: UiActionId; gate?: never } | { gate: ActionGate; action?: never }) & {
  icon?: LucideIcon;
  iconClassName?: string;
  /** The row is part of the built-in help: locked for anyone but an Admin */
  builtIn?: boolean;
};

function useGate({ action, gate, builtIn = false }: { action?: UiActionId; gate?: ActionGate; builtIn?: boolean }): ActionGate {
  const access = useAccess();
  return gate ?? builtInGateFor(access, action as UiActionId, builtIn);
}

/** The control as is, or inside a LockedHint when its gate is locked (no gate: as is). */
export function withLockHint(gate: ActionGate | undefined, control: ReactNode, block = false): ReactNode {
  return gate?.state === 'locked' ? <LockedHint reason={gate.reason} block={block}>{control}</LockedHint> : control;
}

/** A button: usable when allowed, locked with the reason otherwise. */
export function ActionButton({ action, gate: given, builtIn, icon, iconClassName = 'mr-2 size-4', disabled, children, ...props }: ComponentProps<typeof Button> & GateProps) {
  const gate = useGate({ action, gate: given, builtIn });
  return withLockHint(gate, (
    <Button {...props} disabled={disabled || gate.state !== 'allowed'}>
      {iconFor(gate, icon, iconClassName)}
      {children}
    </Button>
  ));
}

/** A menu item: usable when allowed, locked with the reason otherwise. */
export function ActionMenuItem({ action, gate: given, builtIn, icon, iconClassName = 'mr-2 size-4', disabled, children, ...props }: ComponentProps<typeof DropdownMenuItem> & GateProps) {
  const gate = useGate({ action, gate: given, builtIn });
  return withLockHint(gate, (
    <DropdownMenuItem {...props} disabled={disabled || gate.state !== 'allowed'}>
      {iconFor(gate, icon, iconClassName)}
      {children}
    </DropdownMenuItem>
  ), true);
}

/** A switch: always shows its value; switchable only when allowed. */
export function ActionSwitch({ action, gate: given, builtIn, disabled, ...props }: ComponentProps<typeof Switch> & Omit<GateProps, 'icon' | 'iconClassName'>) {
  const gate = useGate({ action, gate: given, builtIn });
  return withLockHint(gate, <Switch {...props} disabled={disabled || gate.state !== 'allowed'} />);
}
