// src/shared/ui/custom/skeletons/PageHeaderSkeleton.tsx
'use client';

import { Skeleton } from '@/components/ui/skeleton';

interface PageHeaderSkeletonProps {
    showBreadcrumb?: boolean;
    showDescription?: boolean;
    showActions?: boolean;
    actionsCount?: number;
}

export function PageHeaderSkeleton({
    showBreadcrumb = true,
    showDescription = true,
    showActions = true,
    actionsCount = 1,
}: PageHeaderSkeletonProps) {
    return (
        <div className="space-y-4">
            {/* Breadcrumb */}
            {showBreadcrumb && (
                <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-20 rounded-full" />
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 w-28 rounded-full" />
                </div>
            )}

            {/* Title and Actions Row */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-2">
                    {/* Title */}
                    <Skeleton className="h-9 w-56 rounded-lg" />
                    {/* Description */}
                    {showDescription && <Skeleton className="h-4 w-80 rounded-full" />}
                </div>

                {/* Action Buttons */}
                {showActions && (
                    <div className="flex items-center gap-2">
                        {Array.from({ length: actionsCount }).map((_, i) => (
                            <Skeleton key={i} className="h-10 w-40 rounded-lg" />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}