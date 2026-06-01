// src/shared/ui/custom/skeletons/StatsCardsSkeleton.tsx
'use client';

import { Skeleton } from '@/components/ui/skeleton';

interface StatsCardsSkeletonProps {
    count?: number;
    columns?: 2 | 3 | 4;
}

export function StatsCardsSkeleton({
    count = 3,
    columns = 3,
}: StatsCardsSkeletonProps) {
    const gridCols = {
        2: 'md:grid-cols-2',
        3: 'md:grid-cols-3',
        4: 'grid-cols-2 lg:grid-cols-4',
    };

    return (
        <div className={`grid ${gridCols[columns]} gap-4`}>
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm"
                >
                    <div className="flex items-center gap-4">
                        {/* Icon */}
                        <Skeleton className="h-12 w-12 rounded-xl" />
                        <div className="flex flex-col gap-2">
                            {/* Value */}
                            <Skeleton className="h-8 w-14" />
                            {/* Label */}
                            <Skeleton className="h-4 w-24" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}