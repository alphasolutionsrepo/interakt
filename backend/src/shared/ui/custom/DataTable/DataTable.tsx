// src/shared/ui/custom/DataTable/DataTable.tsx
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface DataTableColumn<T> {
    /** Unique key for the column */
    key: string;
    /** Header label */
    header: string;
    /** Custom render function for cell content */
    render?: (row: T) => React.ReactNode;
    /** Additional className for the column */
    className?: string;
    /** Header className */
    headerClassName?: string;
    /** Hide on mobile */
    hideOnMobile?: boolean;
}

export interface DataTableAction<T> {
    /** Label for the action */
    label: string;
    /** Icon component */
    icon?: React.ComponentType<{ className?: string }>;
    /** Click handler */
    onClick: (row: T) => void;
    /** Whether this is a destructive action (shown in red) */
    destructive?: boolean;
    /** Whether to show separator before this action */
    separatorBefore?: boolean;
    /** Disabled state or function to determine disabled state */
    disabled?: boolean | ((row: T) => boolean);
    /** Hidden state or function to determine hidden state */
    hidden?: boolean | ((row: T) => boolean);
}

export interface DataTableProps<T> {
    /** Data to display */
    data: T[];
    /** Column definitions */
    columns: DataTableColumn<T>[];
    /** Actions for each row */
    actions?: DataTableAction<T>[];
    /** Row click handler */
    onRowClick?: (row: T) => void;
    /** Key extractor for rows */
    getRowKey: (row: T) => string | number;
    /** Loading state */
    isLoading?: boolean;
    /** Empty state message */
    emptyMessage?: string;
    /** Empty state icon */
    emptyIcon?: React.ReactNode;
    /** Empty state action */
    emptyAction?: React.ReactNode;
    /** Additional className for the table container */
    className?: string;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface ActionsDropdownProps<T> {
    row: T;
    actions: DataTableAction<T>[];
}

function ActionsDropdown<T>({ row, actions }: ActionsDropdownProps<T>) {
    const visibleActions = actions.filter(action => {
        if (typeof action.hidden === 'function') return !action.hidden(row);
        return !action.hidden;
    });

    if (visibleActions.length === 0) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 rounded-md transition-colors hover:bg-slate-200 text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label="Row actions"
                >
                    <MoreHorizontal className="h-4 w-4" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
                {visibleActions.map((action, index) => {
                    const isDisabled = typeof action.disabled === 'function'
                        ? action.disabled(row)
                        : action.disabled;

                    return (
                        <React.Fragment key={action.label}>
                            {action.separatorBefore && index > 0 && <DropdownMenuSeparator />}
                            <DropdownMenuItem
                                onClick={(e) => {
                                    e.stopPropagation();
                                    action.onClick(row);
                                }}
                                disabled={isDisabled}
                                className={cn(
                                    'cursor-pointer',
                                    action.destructive && 'text-red-600 focus:text-red-600 focus:bg-red-50'
                                )}
                            >
                                {action.icon && <action.icon className="mr-2 h-4 w-4" />}
                                {action.label}
                            </DropdownMenuItem>
                        </React.Fragment>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DataTable<T>({
    data,
    columns,
    actions,
    onRowClick,
    getRowKey,
    isLoading,
    emptyMessage = 'No data found',
    emptyIcon,
    emptyAction,
    className,
}: DataTableProps<T>) {
    // Empty state
    if (!isLoading && data.length === 0) {
        return (
            <div className={cn(
                'flex flex-col items-center justify-center rounded-xl border border-dashed py-16',
                className
            )}>
                {emptyIcon && (
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        {emptyIcon}
                    </div>
                )}
                <h3 className="mt-4 text-lg font-semibold">{emptyMessage}</h3>
                {emptyAction && <div className="mt-6">{emptyAction}</div>}
            </div>
        );
    }

    return (
        <div className={cn(
            'rounded-xl border bg-card',
            className
        )}>
            <div className="overflow-x-auto">
                <table className="w-full">
                    {/* Header */}
                    <thead>
                        <tr className="border-b bg-muted/50">
                            {columns.map((column) => (
                                <th
                                    key={column.key}
                                    className={cn(
                                        'h-12 px-4 text-left align-middle font-medium text-muted-foreground text-sm',
                                        column.hideOnMobile && 'hidden md:table-cell',
                                        column.headerClassName
                                    )}
                                >
                                    {column.header}
                                </th>
                            ))}
                            {actions && actions.length > 0 && (
                                <th className="h-12 w-12 px-4">
                                    <span className="sr-only">Actions</span>
                                </th>
                            )}
                        </tr>
                    </thead>

                    {/* Body */}
                    <tbody className="[&_tr:last-child]:border-0">
                        {data.map((row) => {
                            const rowKey = getRowKey(row);
                            const isClickable = !!onRowClick;

                            return (
                                <tr
                                    key={rowKey}
                                    className={cn(
                                        'group/row border-b transition-colors',
                                        isClickable && 'cursor-pointer',
                                        'hover:bg-muted/50'
                                    )}
                                    onClick={() => onRowClick?.(row)}
                                >
                                    {columns.map((column) => (
                                        <td
                                            key={column.key}
                                            className={cn(
                                                'p-4 align-middle',
                                                column.hideOnMobile && 'hidden md:table-cell',
                                                column.className
                                            )}
                                        >
                                            {column.render
                                                ? column.render(row)
                                                : (row as Record<string, unknown>)[column.key] as React.ReactNode
                                            }
                                        </td>
                                    ))}
                                    {actions && actions.length > 0 && (
                                        <td className="w-12 p-4 text-right align-middle">
                                            <ActionsDropdown row={row} actions={actions} />
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default DataTable;