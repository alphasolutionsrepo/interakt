// src/shared/ui/custom/skeletons/FormSkeleton.tsx
'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface FormSkeletonProps {
    fields?: number;
    showCard?: boolean;
    showHeader?: boolean;
}

export function FormSkeleton({
    fields = 4,
    showCard = true,
    showHeader = true,
}: FormSkeletonProps) {
    const formContent = (
        <div className="space-y-6">
            {Array.from({ length: fields }).map((_, i) => (
                <div key={i} className="space-y-2">
                    {/* Label */}
                    <Skeleton className="h-4 w-24" />
                    {/* Input */}
                    <Skeleton className="h-10 w-full" />
                </div>
            ))}

            {/* Submit Button */}
            <div className="flex justify-end pt-4">
                <Skeleton className="h-10 w-32" />
            </div>
        </div>
    );

    if (showCard) {
        return (
            <Card className="border-slate-200 max-w-4xl">
                {showHeader && (
                    <CardHeader>
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-4 w-72" />
                    </CardHeader>
                )}
                <CardContent>{formContent}</CardContent>
            </Card>
        );
    }

    return formContent;
}