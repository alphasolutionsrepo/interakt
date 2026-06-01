// app/search-indexes/_components/ImportWizard/StepReview.tsx

/**
 * Step 4: Review & Import
 *
 * Shows a summary of all settings before final import.
 */

'use client';

import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    FileJson,
    Brain,
    Layers,
    AlertCircle,
    CheckCircle2,
} from 'lucide-react';
import { SEARCH_TYPE_INFO } from '@/features/search-index';
import type { SearchIndexImportPreview } from '../../_lib/api-client';

// ============================================================================
// TYPES
// ============================================================================

interface StepReviewProps {
    preview: SearchIndexImportPreview;
    overrideName: string;
    providerName?: string;
    modelName?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StepReview({
    preview,
    overrideName,
    providerName,
    modelName,
}: StepReviewProps) {
    const finalName = overrideName.trim() || preview.searchIndex.name;
    const searchTypeInfo = SEARCH_TYPE_INFO[preview.searchIndex.searchType as keyof typeof SEARCH_TYPE_INFO];

    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="text-center pb-4 border-b border-border/50">
                <h3 className="font-semibold text-lg">Review Import Settings</h3>
                <p className="text-sm text-muted-foreground mt-1">
                    Please review the settings below before importing the search index.
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Index Info Card */}
                <div className="p-4 border rounded-xl bg-card">
                    <div className="flex items-center gap-2 mb-3">
                        <FileJson className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">Search Index</span>
                    </div>
                    <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Display Name</span>
                            <span className="font-medium">{preview.searchIndex.displayName}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Index Name</span>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                {finalName}
                            </code>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Search Type</span>
                            <Badge variant="secondary" className="rounded-lg">
                                {searchTypeInfo?.label || preview.searchIndex.searchType}
                            </Badge>
                        </div>
                    </div>
                </div>

                {/* Fields Card */}
                <div className="p-4 border rounded-xl bg-card">
                    <div className="flex items-center gap-2 mb-3">
                        <Layers className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">Fields</span>
                    </div>
                    <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Total Fields</span>
                            <span className="font-medium">{preview.fieldCount}</span>
                        </div>
                        <p className="text-xs text-muted-foreground pt-2">
                            All field configurations from the export will be imported.
                        </p>
                    </div>
                </div>

                {/* AI Config Card (conditional) */}
                {preview.requiresAIConfig && providerName && modelName && (
                    <div className="p-4 border rounded-xl bg-card">
                        <div className="flex items-center gap-2 mb-3">
                            <Brain className="h-4 w-4 text-primary" />
                            <span className="font-medium text-sm">AI Configuration</span>
                        </div>
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Provider</span>
                                <span className="font-medium">{providerName}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Model</span>
                                <span className="font-medium">{modelName}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Warnings */}
            {preview.warnings.length > 0 && (
                <Alert className="rounded-xl border-amber-500/50 bg-amber-500/10">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <AlertDescription className="text-amber-700 dark:text-amber-400">
                        <p className="font-medium mb-2">Warnings:</p>
                        <ul className="list-disc list-inside text-sm space-y-1">
                            {preview.warnings.map((warning, i) => (
                                <li key={i}>{warning}</li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}

            {/* Final Confirmation */}
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
                <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                        <p className="font-medium text-primary">Ready to Import</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Click the <strong>Import</strong> button to create the search index with the settings above.
                            The Elasticsearch index will be created when documents are first indexed.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
