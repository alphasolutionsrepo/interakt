// app/search-indexes/_components/FieldMappingSummary.tsx

'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
    CheckCircle2,
    AlertCircle,
    Layers,
    Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FieldMappingSummary as FieldMappingSummaryType } from '@/features/search-index';

// ============================================================================
// TYPES
// ============================================================================

interface FieldMappingSummaryProps {
    summary: FieldMappingSummaryType | null;
    isLoading?: boolean;
    compact?: boolean;
}

// ============================================================================
// SUB COMPONENTS
// ============================================================================

function SummarySkeleton() {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
                <Card key={i} className="border-slate-200">
                    <CardContent className="p-4">
                        <div className="h-4 w-20 bg-slate-200 rounded animate-pulse mb-2" />
                        <div className="h-8 w-12 bg-slate-200 rounded animate-pulse" />
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

function CompactSkeleton() {
    return (
        <Card className="border-slate-200 h-full">
            <CardContent className="p-3">
                <div className="flex items-center gap-3">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                            <div className="h-4 w-4 bg-slate-200 rounded animate-pulse" />
                            <div className="h-4 w-6 bg-slate-200 rounded animate-pulse" />
                            <div className="h-3 w-12 bg-slate-200 rounded animate-pulse" />
                            {i < 3 && <div className="w-px h-5 bg-slate-200 ml-1.5" />}
                        </div>
                    ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 bg-slate-200 rounded animate-pulse" />
                    <div className="h-3 w-8 bg-slate-200 rounded animate-pulse" />
                </div>
            </CardContent>
        </Card>
    );
}

interface MiniStatProps {
    icon: React.ReactNode;
    value: string | number;
    label: string;
    colorClass?: string;
}

function MiniStat({ icon, value, label, colorClass = 'text-slate-700' }: MiniStatProps) {
    return (
        <div className="flex items-center gap-1.5">
            <span className={cn('flex h-4 w-4 items-center justify-center [&>svg]:h-4 [&>svg]:w-4', colorClass)}>
                {icon}
            </span>
            <span className={cn('text-sm font-semibold tabular-nums', colorClass)}>{value}</span>
            <span className="text-xs text-slate-500">{label}</span>
        </div>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FieldMappingSummary({
    summary,
    isLoading,
    compact = false,
}: FieldMappingSummaryProps) {
    if (isLoading) {
        return compact ? <CompactSkeleton /> : <SummarySkeleton />;
    }

    if (!summary) {
        return null;
    }

    const mappingPercentage = summary.totalFields > 0
        ? Math.round((summary.mappedFields / summary.totalFields) * 100)
        : 0;

    if (compact) {
        return (
            <Card className="border-slate-200 h-full">
                <CardContent className="p-3">
                    <div className="flex items-center gap-3 flex-wrap">
                        <MiniStat
                            icon={<Layers />}
                            value={summary.totalFields}
                            label="Total"
                        />
                        <div className="w-px h-5 bg-slate-200" />
                        <MiniStat
                            icon={<CheckCircle2 />}
                            value={summary.mappedFields}
                            label="Mapped"
                            colorClass="text-emerald-600"
                        />
                        <div className="w-px h-5 bg-slate-200" />
                        <MiniStat
                            icon={<AlertCircle />}
                            value={summary.unmappedFields}
                            label="Unmapped"
                            colorClass={summary.unmappedFields > 0 ? 'text-amber-600' : 'text-slate-400'}
                        />
                        <div className="w-px h-5 bg-slate-200" />
                        <MiniStat
                            icon={<Target />}
                            value={`${summary.requiredMappedFields}/${summary.requiredFields}`}
                            label="Required"
                            colorClass={summary.isReadyForIndexing ? 'text-emerald-600' : 'text-red-600'}
                        />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                        <Progress value={mappingPercentage} className="h-1.5 flex-1" />
                        <span className="text-xs text-slate-500 tabular-nums">{mappingPercentage}%</span>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const requiredPercentage = summary.requiredFields > 0
        ? Math.round((summary.requiredMappedFields / summary.requiredFields) * 100)
        : 100;

    return (
        <div className="space-y-4">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Total Fields */}
                <Card className="border-slate-200">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Total Fields</p>
                                <p className="text-2xl font-bold text-slate-900">
                                    {summary.totalFields}
                                </p>
                            </div>
                            <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                                <Layers className="h-5 w-5 text-slate-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Mapped Fields */}
                <Card className="border-slate-200">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Mapped</p>
                                <p className="text-2xl font-bold text-emerald-600">
                                    {summary.mappedFields}
                                </p>
                            </div>
                            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Unmapped Fields */}
                <Card className="border-slate-200">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Unmapped</p>
                                <p className={cn(
                                    'text-2xl font-bold',
                                    summary.unmappedFields > 0 ? 'text-amber-600' : 'text-slate-400'
                                )}>
                                    {summary.unmappedFields}
                                </p>
                            </div>
                            <div className={cn(
                                'h-10 w-10 rounded-full flex items-center justify-center',
                                summary.unmappedFields > 0 ? 'bg-amber-100' : 'bg-slate-100'
                            )}>
                                <AlertCircle className={cn(
                                    'h-5 w-5',
                                    summary.unmappedFields > 0 ? 'text-amber-600' : 'text-slate-400'
                                )} />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Required Status */}
                <Card className={cn(
                    'border-slate-200',
                    !summary.isReadyForIndexing && 'border-red-200 bg-red-50/30'
                )}>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Required</p>
                                <p className={cn(
                                    'text-2xl font-bold',
                                    summary.isReadyForIndexing ? 'text-emerald-600' : 'text-red-600'
                                )}>
                                    {summary.requiredMappedFields}/{summary.requiredFields}
                                </p>
                            </div>
                            <div className={cn(
                                'h-10 w-10 rounded-full flex items-center justify-center',
                                summary.isReadyForIndexing ? 'bg-emerald-100' : 'bg-red-100'
                            )}>
                                <Target className={cn(
                                    'h-5 w-5',
                                    summary.isReadyForIndexing ? 'text-emerald-600' : 'text-red-600'
                                )} />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Progress Bar */}
            <Card className="border-slate-200">
                <CardContent className="p-4">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600">Mapping Progress</span>
                            <span className="font-medium text-slate-900">{mappingPercentage}%</span>
                        </div>
                        <Progress value={mappingPercentage} className="h-2" />

                        {!summary.isReadyForIndexing && (
                            <div className="flex items-center gap-2 text-sm text-red-600 mt-2">
                                <AlertCircle className="h-4 w-4" />
                                <span>
                                    {summary.requiredFields - summary.requiredMappedFields} required field(s) not mapped
                                </span>
                            </div>
                        )}

                        {summary.isReadyForIndexing && (
                            <div className="flex items-center gap-2 text-sm text-emerald-600 mt-2">
                                <CheckCircle2 className="h-4 w-4" />
                                <span>All required fields are mapped. Ready for indexing!</span>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
