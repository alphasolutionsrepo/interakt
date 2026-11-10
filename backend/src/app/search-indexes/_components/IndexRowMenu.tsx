// app/search-indexes/_components/IndexRowMenu.tsx

'use client';

import { Edit2, Eye, MoreVertical, RotateCcw, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SearchIndexSummary } from '@/features/search-index';
import { ActionMenuItem } from '@/shared/access/ActionControls';

/** One index's menu, the same in the card and table views; changes locked with the reason for who may not make them. */
export function IndexRowMenu({ index, onView, onEdit, onDelete, triggerClassName, iconClassName = 'size-4', itemClassName }: {
  index: Pick<SearchIndexSummary, 'status'>;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  triggerClassName: string;
  iconClassName?: string;
  itemClassName: string;
}) {
  const stop = (run: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); run(); };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={triggerClassName} onClick={(e) => e.stopPropagation()}>
          <MoreVertical className={iconClassName} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 rounded-xl">
        <DropdownMenuItem onClick={stop(onView)} className={itemClassName}>
          <Eye className="size-4" />
          View Details
        </DropdownMenuItem>
        <ActionMenuItem action="search-indexes.edit" icon={Edit2} iconClassName="size-4" onClick={stop(onEdit)} className={itemClassName}>
          Edit
        </ActionMenuItem>
        <ActionMenuItem
          action="documents.reindex"
          icon={RotateCcw}
          iconClassName="size-4"
          onClick={(e) => e.stopPropagation()}
          className={itemClassName}
          disabled={index.status === 'indexing' || index.status === 'creating'}
        >
          Reindex
        </ActionMenuItem>
        <DropdownMenuSeparator />
        <ActionMenuItem
          action="search-indexes.delete"
          icon={Trash2}
          iconClassName="size-4"
          onClick={stop(onDelete)}
          className={`text-destructive focus:text-destructive ${itemClassName}`}
        >
          Delete
        </ActionMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
