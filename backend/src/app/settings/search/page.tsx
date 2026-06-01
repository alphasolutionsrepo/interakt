// app/settings/search/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import {
    Settings2,
    RefreshCw,
    Save,
    Timer,
    Blend,
    Info,
} from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    useGlobalSearchSettings,
    useUpdateGlobalSearchSettings,
} from './_lib/hooks/useGlobalSearchSettings';
import { PageHeader } from '@/shared/ui/custom/PageHeader';

// ============================================================================
// FORM SCHEMA
// ============================================================================

const formSchema = z.object({
    searchTimeout: z.number()
        .int()
        .min(1000, 'Timeout must be at least 1 second')
        .max(120000, 'Timeout cannot exceed 2 minutes'),
    rrfRankConstant: z.number()
        .int()
        .min(1)
        .max(1000),
    rrfWindowSize: z.number()
        .int()
        .min(10)
        .max(500),
    lexicalWeight: z.number()
        .min(0.1)
        .max(3.0),
    semanticWeight: z.number()
        .min(0.1)
        .max(3.0),
});

type FormData = z.infer<typeof formSchema>;

// ============================================================================
// PAGE SKELETON
// ============================================================================

function PageSkeleton() {
    return (
        <div className="flex-1 space-y-8 p-6 lg:p-8">
            <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-5 w-96" />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
                <Skeleton className="h-64 rounded-2xl" />
                <Skeleton className="h-64 rounded-2xl" />
            </div>
        </div>
    );
}

// ============================================================================
// INFO TOOLTIP
// ============================================================================

function InfoTooltip({ content }: { content: string }) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Info className="size-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                    <p className="text-sm">{content}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function GlobalSearchSettingsPage() {
    const { settings, isLoading, refetch } = useGlobalSearchSettings();
    const updateSettings = useUpdateGlobalSearchSettings();
    const [hasChanges, setHasChanges] = useState(false);

    const form = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            searchTimeout: 30000,
            rrfRankConstant: 60,
            rrfWindowSize: 100,
            lexicalWeight: 1.0,
            semanticWeight: 1.0,
        },
    });

    // Update form when settings load
    useEffect(() => {
        if (settings) {
            form.reset({
                searchTimeout: settings.searchTimeout,
                rrfRankConstant: settings.rrfRankConstant,
                rrfWindowSize: settings.rrfWindowSize,
                lexicalWeight: settings.lexicalWeight,
                semanticWeight: settings.semanticWeight,
            });
            setHasChanges(false);
        }
    }, [settings, form]);

    // Track changes
    const watchedValues = form.watch();
    useEffect(() => {
        if (settings) {
            const changed =
                watchedValues.searchTimeout !== settings.searchTimeout ||
                watchedValues.rrfRankConstant !== settings.rrfRankConstant ||
                watchedValues.rrfWindowSize !== settings.rrfWindowSize ||
                Math.abs(watchedValues.lexicalWeight - settings.lexicalWeight) > 0.01 ||
                Math.abs(watchedValues.semanticWeight - settings.semanticWeight) > 0.01;
            setHasChanges(changed);
        }
    }, [watchedValues, settings]);

    const onSubmit = async (data: FormData) => {
        await updateSettings.mutateAsync(data);
        setHasChanges(false);
    };

    const handleReset = () => {
        if (settings) {
            form.reset({
                searchTimeout: settings.searchTimeout,
                rrfRankConstant: settings.rrfRankConstant,
                rrfWindowSize: settings.rrfWindowSize,
                lexicalWeight: settings.lexicalWeight,
                semanticWeight: settings.semanticWeight,
            });
            setHasChanges(false);
        }
    };

    if (isLoading) {
        return <PageSkeleton />;
    }

    return (
        <div className="flex-1 space-y-8 p-6 lg:p-8">
            {/* Header */}
            <PageHeader
                variant="settings"
                title="Search Settings"
                description="Configure global defaults for search operations"
                icon={Blend}
                iconBg="bg-primary/10"
                iconColor="text-primary"
                breadcrumb={
                    <>
                        <Settings2 className="size-4" />
                        <span className="font-medium">Settings</span>
                    </>
                }
                actions={
                    <>
                        <Button
                            variant="outline"
                            onClick={() => refetch()}
                            className="rounded-xl"
                        >
                            <RefreshCw className="mr-2 size-4" />
                            Refresh
                        </Button>
                        <Button
                            onClick={form.handleSubmit(onSubmit)}
                            disabled={!hasChanges || updateSettings.isPending}
                            className="rounded-xl shadow-lg"
                        >
                            {updateSettings.isPending ? (
                                <RefreshCw className="mr-2 size-4 animate-spin" />
                            ) : (
                                <Save className="mr-2 size-4" />
                            )}
                            Save Changes
                        </Button>
                    </>
                }
            />

            <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="grid gap-6 md:grid-cols-2">
                    {/* Timeout Settings */}
                    <Card className="rounded-2xl border-border/60">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/15">
                                    <Timer className="size-5 text-blue-600" />
                                </div>
                                <div>
                                    <CardTitle className="text-lg">Search Timeout</CardTitle>
                                    <CardDescription>
                                        Maximum time for search operations
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="searchTimeout">Timeout (ms)</Label>
                                        <InfoTooltip content="Maximum time in milliseconds before a search operation times out. Prevents long-running queries from blocking resources." />
                                    </div>
                                    <span className="text-sm text-muted-foreground">
                                        {(form.watch('searchTimeout') / 1000).toFixed(1)}s
                                    </span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <Slider
                                        value={[form.watch('searchTimeout')]}
                                        onValueChange={([value]) => form.setValue('searchTimeout', value)}
                                        min={1000}
                                        max={120000}
                                        step={1000}
                                        className="flex-1"
                                    />
                                    <Input
                                        id="searchTimeout"
                                        type="number"
                                        {...form.register('searchTimeout', { valueAsNumber: true })}
                                        className="w-24 rounded-lg"
                                    />
                                </div>
                                {form.formState.errors.searchTimeout && (
                                    <p className="text-sm text-destructive">
                                        {form.formState.errors.searchTimeout.message}
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Hybrid Search Settings */}
                    <Card className="rounded-2xl border-border/60">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <div className="flex size-10 items-center justify-center rounded-xl bg-purple-500/15">
                                    <Blend className="size-5 text-purple-600" />
                                </div>
                                <div>
                                    <CardTitle className="text-lg">Hybrid Search</CardTitle>
                                    <CardDescription>
                                        RRF fusion and weight settings
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* RRF Rank Constant */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="rrfRankConstant">RRF Rank Constant (k)</Label>
                                    <InfoTooltip content="Higher values reduce the impact of top-ranked documents. Formula: score = 1/(k + rank). Default: 60" />
                                </div>
                                <div className="flex items-center gap-4">
                                    <Slider
                                        value={[form.watch('rrfRankConstant')]}
                                        onValueChange={([value]) => form.setValue('rrfRankConstant', value)}
                                        min={1}
                                        max={200}
                                        step={1}
                                        className="flex-1"
                                    />
                                    <Input
                                        id="rrfRankConstant"
                                        type="number"
                                        {...form.register('rrfRankConstant', { valueAsNumber: true })}
                                        className="w-20 rounded-lg"
                                    />
                                </div>
                            </div>

                            {/* RRF Window Size */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="rrfWindowSize">Window Size</Label>
                                    <InfoTooltip content="Number of results to consider from lexical and semantic searches before fusion. Default: 100" />
                                </div>
                                <div className="flex items-center gap-4">
                                    <Slider
                                        value={[form.watch('rrfWindowSize')]}
                                        onValueChange={([value]) => form.setValue('rrfWindowSize', value)}
                                        min={10}
                                        max={500}
                                        step={10}
                                        className="flex-1"
                                    />
                                    <Input
                                        id="rrfWindowSize"
                                        type="number"
                                        {...form.register('rrfWindowSize', { valueAsNumber: true })}
                                        className="w-20 rounded-lg"
                                    />
                                </div>
                            </div>

                            {/* Lexical Weight */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="lexicalWeight">Lexical Weight</Label>
                                        <InfoTooltip content="Weight for keyword/text search results. Higher values favor exact keyword matches. Range: 0.1-3.0" />
                                    </div>
                                    <span className="text-sm font-mono text-muted-foreground">
                                        {form.watch('lexicalWeight').toFixed(1)}
                                    </span>
                                </div>
                                <Slider
                                    value={[form.watch('lexicalWeight')]}
                                    onValueChange={([value]) => form.setValue('lexicalWeight', value)}
                                    min={0.1}
                                    max={3.0}
                                    step={0.1}
                                />
                            </div>

                            {/* Semantic Weight */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="semanticWeight">Semantic Weight</Label>
                                        <InfoTooltip content="Weight for vector/meaning-based search results. Higher values favor conceptual similarity. Range: 0.1-3.0" />
                                    </div>
                                    <span className="text-sm font-mono text-muted-foreground">
                                        {form.watch('semanticWeight').toFixed(1)}
                                    </span>
                                </div>
                                <Slider
                                    value={[form.watch('semanticWeight')]}
                                    onValueChange={([value]) => form.setValue('semanticWeight', value)}
                                    min={0.1}
                                    max={3.0}
                                    step={0.1}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Footer Actions */}
                {hasChanges && (
                    <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-border/60">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleReset}
                            className="rounded-xl"
                        >
                            Discard Changes
                        </Button>
                        <Button
                            type="submit"
                            disabled={updateSettings.isPending}
                            className="rounded-xl"
                        >
                            {updateSettings.isPending ? (
                                <RefreshCw className="mr-2 size-4 animate-spin" />
                            ) : (
                                <Save className="mr-2 size-4" />
                            )}
                            Save Changes
                        </Button>
                    </div>
                )}
            </form>
        </div>
    );
}
