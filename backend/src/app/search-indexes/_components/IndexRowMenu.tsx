// app/search-indexes/_components/IndexRowMenu.tsx

'use client';

import { RotateCcw } from 'lucide-react';

import type { SearchIndexSummary } from '@/features/search-index';
import { RowActionsMenu } from '@/shared/ui/custom/RowActionsMenu';

/** One index's menu, the same in the card and table views. */
export function IndexRowMenu({ index, onView, onEdit, onDelete, triggerClassName, iconClassName, itemClassName }: {
  index: Pick<SearchIndexSummary, 'status'>;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  triggerClassName: string;
  iconClassName?: string;
  itemClassName: string;
}) {
  return (
    <RowActionsMenu
      onView={onView}
      onEdit={onEdit}
      onDelete={onDelete}
      editAction="search-indexes.edit"
      deleteAction="search-indexes.delete"
      extra={[{
        label: 'Reindex',
        icon: RotateCcw,
        action: 'documents.reindex',
        // Not wired to a reindex yet (on the roadmap); the detail page's Reindex works
        onSelect: () => {},
        disabled: index.status === 'indexing' || index.status === 'creating',
      }]}
      triggerClassName={triggerClassName}
      triggerIconClassName={iconClassName}
      itemClassName={itemClassName}
    />
  );
}
