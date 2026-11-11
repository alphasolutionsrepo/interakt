// app/search-indexes/_components/IndexRowMenu.tsx

'use client';


import type { SearchIndexSummary } from '@/features/search-index';
import { RowActionsMenu } from '@/shared/ui/custom/RowActionsMenu';

/** One index's menu, the same in the card and table views. */
export function IndexRowMenu({ index, onView, onEdit, onDelete, triggerClassName, iconClassName, itemClassName }: {
  index: Pick<SearchIndexSummary, 'isBuiltIn'>;
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
      builtIn={index.isBuiltIn}
      triggerClassName={triggerClassName}
      triggerIconClassName={iconClassName}
      itemClassName={itemClassName}
    />
  );
}
