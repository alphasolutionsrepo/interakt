// src/shared/ui/custom/skeletons/TableSkeleton.tsx
'use client';

import { Skeleton } from '@/components/ui/skeleton';

interface TableSkeletonProps {
    rows?: number;
    columns?: number;
    showHeader?: boolean;
    showSearch?: boolean;
}

export function TableSkeleton({
    rows = 5,
    columns = 5,
    showHeader = true,
    showSearch = true,
}: TableSkeletonProps) {
    return (
        <div className="space-y-4">
            {/* Search Bar */}
            {showSearch && (
                <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 p-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <Skeleton className="h-11 flex-1 rounded-xl" />
                        <Skeleton className="h-11 w-44 rounded-xl" />
                        <Skeleton className="h-11 w-11 rounded-xl" />
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
                {/* Table Header */}
                {showHeader && (
                    <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 via-slate-50/60 to-slate-50/80">
                        {Array.from({ length: columns }).map((_, i) => (
                            <Skeleton
                                key={i}
                                className="h-3 rounded-full"
                                style={{ width: `${100 / columns}%` }}
                            />
                        ))}
                    </div>
                )}

                {/* Table Rows */}
                {Array.from({ length: rows }).map((_, rowIndex) => (
                    <div
                        key={rowIndex}
                        className={`flex items-center gap-4 px-6 py-4 ${
                            rowIndex !== rows - 1 ? 'border-b border-slate-100/80' : ''
                        }`}
                    >
                        {/* First column with icon placeholder */}
                        <div className="flex items-center gap-3.5 flex-1">
                            <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                            <div className="flex flex-col gap-2 flex-1">
                                <Skeleton className="h-4 w-3/4 rounded-full" />
                                <Skeleton className="h-3 w-1/2 rounded-full" />
                            </div>
                        </div>
                        {/* Other columns */}
                        {Array.from({ length: columns - 1 }).map((_, colIndex) => (
                            <Skeleton
                                key={colIndex}
                                className="h-6 rounded-full hidden sm:block"
                                style={{ width: `${80 / columns}%` }}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}