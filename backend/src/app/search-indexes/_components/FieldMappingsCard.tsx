// app/search-indexes/_components/FieldMappingsCard.tsx

'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
    Layers,
    ChevronRight,
    CheckCircle2,
    AlertCircle,
    Settings2,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { FieldMappingSummary } from '@/features/search-index';

// ============================================================================
// TYPES
// ============================================================================

interface FieldMappingsCardProps {
    searchIndexId: string;
    summary: FieldMappingSummary | null;
    isLoading?: boolean;
}

// ============================================================================
// SKELETON
// ============================================================================

function FieldMappingsCardSkeleton() {
    return (
        <Card className="border-border/60 shadow-sm rounded-2xl h-full">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-5" />
                        <Skeleton className="h-5 w-24" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                </div>
                <Skeleton className="h-4 w-48 mt-1" />
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-8">
                    <Skeleton className="h-12 w-20" />
                    <Skeleton className="h-12 w-20" />
                    <Skeleton className="h-12 w-20" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
                <div className="flex justify-end">
                    <Skeleton className="h-9 w-36" />
                </div>
            </CardContent>
        </Card>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FieldMappingsCard({
    searchIndexId,
    summary,
    isLoading,
}: FieldMappingsCardProps) {
    const router = useRouter();

    if (isLoading) {
        return <FieldMappingsCardSkeleton />;
    }

    const handleConfigure = () => {
        router.push(`/search-indexes/${searchIndexId}/mappings`);
    };

    const isReady = summary?.isReadyForIndexing ?? false;
    const hasUnmappedRequired = summary
        ? summary.requiredFields > summary.requiredMappedFields
        : false;

    const mappingPercentage = summary && summary.totalFields > 0
        ? Math.round((summary.mappedFields / summary.totalFields) * 100)
        : 0;

    return (
        <Card className="border-border/60 shadow-sm rounded-2xl h-full">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Layers className="h-5 w-5 text-violet-500" />
                        <CardTitle className="text-base font-semibold">Fields</CardTitle>
                    </div>
                    {summary && (
                        <Badge
                            variant="outline"
                            className={cn(
                                'rounded-lg px-2.5 py-1 text-xs font-semibold flex items-center gap-1.5',
                                isReady
                                    ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/25'
                                    : 'bg-amber-500/15 text-amber-600 border-amber-500/25'
                            )}
                        >
                            {isReady ? (
                                <>
                                    <CheckCircle2 className="h-3 w-3" />
                                    Ready
                                </>
                            ) : (
                                <>
                                    <AlertCircle className="h-3 w-3" />
                                    Needs Configuration
                                </>
                            )}
                        </Badge>
                    )}
                </div>
                <CardDescription>
                    Configure search behavior and source data mapping
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Stats */}
                {summary ? (
                    <>
                        <div className="flex gap-8">
                            <div>
                                <p className="text-2xl font-bold tracking-tight">
                                    {summary.totalFields}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">Total Fields</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold tracking-tight text-emerald-600">
                                    {summary.mappedFields}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">Mapped</p>
                            </div>
                            {hasUnmappedRequired && (
                                <div>
                                    <p className="text-2xl font-bold tracking-tight text-amber-600">
                                        {summary.requiredFields - summary.requiredMappedFields}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">Required Unmapped</p>
                                </div>
                            )}
                        </div>

                        {/* Progress */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>Mapping progress</span>
                                <span className="font-medium text-foreground tabular-nums">{mappingPercentage}%</span>
                            </div>
                            <Progress value={mappingPercentage} className="h-1.5" />
                        </div>
                    </>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        No field data available
                    </p>
                )}

                {/* Action */}
                <div className="flex justify-end">
                    <Button
                        variant="outline"
                        className="rounded-xl gap-1.5"
                        onClick={handleConfigure}
                    >
                        <Settings2 className="h-4 w-4" />
                        Configure Fields
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

export default FieldMappingsCard;
