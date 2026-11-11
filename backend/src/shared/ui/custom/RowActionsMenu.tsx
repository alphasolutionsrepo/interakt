// src/shared/ui/custom/RowActionsMenu.tsx

/**
 * The "⋮" menu on a row or card in a list page: View Details, Edit (when there is one), any
 * extra actions, Delete.
 * Each change is locked with the reason for someone who may not make it (ActionControls.tsx).
 * Clicks don't reach the row underneath, which opens the item.
 */

'use client';

import { Edit2, Eye, MoreVertical, Trash2, type LucideIcon } from 'lucide-react';
import type { MouseEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { UiActionId } from '@/features/access/ui-actions';
import { ActionMenuItem, actionProps, type BuiltInFor } from '@/shared/access/ActionControls';

export interface RowExtraAction<X extends UiActionId = UiActionId> {
  label: string;
  icon: LucideIcon;
  action: X;
  onSelect: () => void;
  /** Disabled for its own reason (a job running), without the lock */
  disabled?: boolean;
}

type RowActionsMenuProps<E extends UiActionId, D extends UiActionId, X extends UiActionId> = {
  onView: () => void;
  /** Left out where the item has no edit page (MCP connections) */
  onEdit?: () => void;
  onDelete: () => void;
  editAction?: E;
  deleteAction: D;
  /** Between Edit and Delete */
  extra?: Array<RowExtraAction<X>>;
  triggerClassName: string;
  triggerIconClassName?: string;
  itemClassName: string;
  /** builtIn (part of the built-in help, every change locked for anyone but an Admin): required when an action touches it */
} & BuiltInFor<E | D | X>;

export function RowActionsMenu<E extends UiActionId = never, D extends UiActionId = UiActionId, X extends UiActionId = never>({
  onView, onEdit, onDelete, editAction, deleteAction, extra = [], builtIn = false, triggerClassName, triggerIconClassName = 'size-4', itemClassName,
}: RowActionsMenuProps<E, D, X>) {
  const only = (run: () => void) => (e: MouseEvent) => { e.stopPropagation(); run(); };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={triggerClassName} onClick={(e) => e.stopPropagation()} aria-label="Actions">
          <MoreVertical className={triggerIconClassName} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 rounded-xl">
        <DropdownMenuItem onClick={only(onView)} className={itemClassName}>
          <Eye className="size-4" />
          View Details
        </DropdownMenuItem>
        {onEdit && editAction && (
          <ActionMenuItem {...actionProps(editAction, builtIn)} icon={Edit2} iconClassName="size-4" onClick={only(onEdit)} className={itemClassName}>
            Edit
          </ActionMenuItem>
        )}
        {extra.map((x) => (
          <ActionMenuItem key={x.label} {...actionProps(x.action, builtIn)} icon={x.icon} iconClassName="size-4" onClick={only(x.onSelect)} disabled={x.disabled} className={itemClassName}>
            {x.label}
          </ActionMenuItem>
        ))}
        <DropdownMenuSeparator />
        <ActionMenuItem
          {...actionProps(deleteAction, builtIn)}
          icon={Trash2}
          iconClassName="size-4"
          onClick={only(onDelete)}
          className={`text-destructive focus:text-destructive ${itemClassName}`}
        >
          Delete
        </ActionMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
