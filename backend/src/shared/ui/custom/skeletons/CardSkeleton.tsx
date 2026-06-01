// src/shared/ui/custom/skeletons/CardSkeleton.tsx
'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface CardSkeletonProps {
    showHeader?: boolean;
    lines?: number;
    showFooter?: boolean;
}

export function CardSkeleton({
    showHeader = true,
    lines = 3,
    showFooter = false,
}: CardSkeletonProps) {
    return (
        <Card className="border-slate-200">
            {showHeader && (
                <CardHeader>
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-64" />
                </CardHeader>
            )}
            <CardContent className="space-y-3">
                {Array.from({ length: lines }).map((_, i) => (
                    <Skeleton 
                        key={i} 
                        className="h-4" 
                        style={{ width: `${Math.random() * 40 + 60}%` }}
                    />
                ))}
                {showFooter && (
                    <div className="flex justify-end gap-2 pt-4">
                        <Skeleton className="h-9 w-20" />
                        <Skeleton className="h-9 w-24" />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}