// src/shared/ui/custom/RowActionsMenu.tsx

/**
 * The "⋮" menu on a row or card in a list page: View Details, Edit, any extra actions, Delete.
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
import { ActionMenuItem } from '@/shared/access/ActionControls';

export interface RowExtraAction {
  label: string;
  icon: LucideIcon;
  action: UiActionId;
  onSelect: () => void;
  /** Disabled for its own reason (a job running), without the lock */
  disabled?: boolean;
}

interface RowActionsMenuProps {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  editAction: UiActionId;
  deleteAction: UiActionId;
  /** Between Edit and Delete */
  extra?: RowExtraAction[];
  triggerClassName: string;
  triggerIconClassName?: string;
  itemClassName: string;
}

export function RowActionsMenu({
  onView, onEdit, onDelete, editAction, deleteAction, extra = [], triggerClassName, triggerIconClassName = 'size-4', itemClassName,
}: RowActionsMenuProps) {
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
        <ActionMenuItem action={editAction} icon={Edit2} iconClassName="size-4" onClick={only(onEdit)} className={itemClassName}>
          Edit
        </ActionMenuItem>
        {extra.map((x) => (
          <ActionMenuItem key={x.label} action={x.action} icon={x.icon} iconClassName="size-4" onClick={only(x.onSelect)} disabled={x.disabled} className={itemClassName}>
            {x.label}
          </ActionMenuItem>
        ))}
        <DropdownMenuSeparator />
        <ActionMenuItem
          action={deleteAction}
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
