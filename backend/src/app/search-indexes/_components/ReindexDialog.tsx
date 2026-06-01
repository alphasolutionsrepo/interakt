// app/search-indexes/_components/ReindexDialog.tsx

/**
 * Reindex Dialog Component
 *
 * Shows a confirmation dialog before reindexing, displays progress,
 * and shows results when complete.
 */

'use client';

import { useState, useCallback } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    RotateCcw,
    Loader2,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    FileText,
    Clock,
    Database,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

type ReindexState = 'idle' | 'confirming' | 'reindexing' | 'success' | 'error';

interface ReindexResult {
    documentCount: number;
    durationMs: number;
}

interface ReindexDialogProps {
    /** Whether the dialog is open */
    open: boolean;
    /** Callback when dialog should close */
    onOpenChange: (open: boolean) => void;
    /** Index name for display */
    indexName: string;
    /** Current document count (for display) */
    currentDocumentCount?: number;
    /** Function to trigger reindex - should return the result */
    onReindex: () => Promise<ReindexResult>;
    /** Callback when reindex completes successfully */
    onSuccess?: (result: ReindexResult) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ReindexDialog({
    open,
    onOpenChange,
    indexName,
    currentDocumentCount,
    onReindex,
    onSuccess,
}: ReindexDialogProps) {
    const [state, setState] = useState<ReindexState>('confirming');
    const [result, setResult] = useState<ReindexResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [startTime, setStartTime] = useState<number | null>(null);

    // Reset state when dialog opens
    const handleOpenChange = useCallback((newOpen: boolean) => {
        if (newOpen) {
            setState('confirming');
            setResult(null);
            setError(null);
            setStartTime(null);
        }
        onOpenChange(newOpen);
    }, [onOpenChange]);

    // Handle reindex
    const handleReindex = useCallback(async () => {
        setState('reindexing');
        setStartTime(Date.now());
        setError(null);

        try {
            const reindexResult = await onReindex();
            setResult(reindexResult);
            setState('success');
            onSuccess?.(reindexResult);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Reindex failed';
            setError(errorMessage);
            setState('error');
        }
    }, [onReindex, onSuccess]);

    // Format duration
    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <RotateCcw className={cn(
                            "h-5 w-5",
                            state === 'reindexing' && "animate-spin text-blue-500",
                            state === 'success' && "text-emerald-500",
                            state === 'error' && "text-red-500"
                        )} />
                        {state === 'confirming' && 'Reindex Search Index'}
                        {state === 'reindexing' && 'Reindexing...'}
                        {state === 'success' && 'Reindex Complete'}
                        {state === 'error' && 'Reindex Failed'}
                    </DialogTitle>
                    <DialogDescription>
                        {state === 'confirming' && (
                            <>Rebuild the search index with updated field mappings.</>
                        )}
                        {state === 'reindexing' && (
                            <>Please wait while documents are being reindexed.</>
                        )}
                        {state === 'success' && (
                            <>The index has been successfully rebuilt.</>
                        )}
                        {state === 'error' && (
                            <>An error occurred during reindexing.</>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {/* Confirming State */}
                    {state === 'confirming' && (
                        <div className="space-y-4">
                            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-600">Index</span>
                                    <Badge variant="outline" className="font-mono">
                                        {indexName}
                                    </Badge>
                                </div>
                                {currentDocumentCount !== undefined && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-600">Documents</span>
                                        <span className="text-sm font-medium">
                                            {currentDocumentCount.toLocaleString()}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <div className="flex gap-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-amber-800">
                                        <p className="font-medium">This will:</p>
                                        <ul className="list-disc list-inside mt-1 space-y-0.5 text-amber-700">
                                            <li>Fetch all documents from the current index</li>
                                            <li>Delete and recreate the index with new mappings</li>
                                            <li>Re-index all documents (preserving embeddings)</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Reindexing State */}
                    {state === 'reindexing' && (
                        <div className="space-y-4">
                            <div className="flex flex-col items-center justify-center py-8">
                                <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
                                <p className="text-sm text-slate-600">
                                    Reindexing documents...
                                </p>
                                {startTime && (
                                    <p className="text-xs text-slate-400 mt-2">
                                        Elapsed: {formatDuration(Date.now() - startTime)}
                                    </p>
                                )}
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <p className="text-sm text-blue-700">
                                    This may take a while depending on the number of documents.
                                    Please do not close this dialog.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Success State */}
                    {state === 'success' && result && (
                        <div className="space-y-4">
                            <div className="flex flex-col items-center justify-center py-4">
                                <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                                    <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <FileText className="h-4 w-4" />
                                        <span className="text-sm">Documents Indexed</span>
                                    </div>
                                    <span className="text-lg font-semibold text-emerald-600">
                                        {result.documentCount.toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <Clock className="h-4 w-4" />
                                        <span className="text-sm">Duration</span>
                                    </div>
                                    <span className="text-sm font-medium">
                                        {formatDuration(result.durationMs)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <Database className="h-4 w-4" />
                                        <span className="text-sm">Index</span>
                                    </div>
                                    <Badge variant="outline" className="font-mono text-xs">
                                        {indexName}
                                    </Badge>
                                </div>
                            </div>

                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                <p className="text-sm text-emerald-700">
                                    Index mappings have been updated. Autocomplete and other
                                    field settings are now active.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Error State */}
                    {state === 'error' && (
                        <div className="space-y-4">
                            <div className="flex flex-col items-center justify-center py-4">
                                <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
                                    <XCircle className="h-8 w-8 text-red-600" />
                                </div>
                            </div>

                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <p className="text-sm text-red-700 font-medium mb-1">
                                    Error Details
                                </p>
                                <pre className="text-sm text-red-600 whitespace-pre-wrap break-words max-h-48 overflow-y-auto font-sans">
                                    {error || 'An unknown error occurred'}
                                </pre>
                            </div>

                            <p className="text-sm text-slate-500 text-center">
                                You can try again or check the server logs for more details.
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {state === 'confirming' && (
                        <>
                            <Button
                                variant="outline"
                                onClick={() => handleOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleReindex}
                                className="bg-amber-600 hover:bg-amber-700"
                            >
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Start Reindex
                            </Button>
                        </>
                    )}

                    {state === 'reindexing' && (
                        <Button variant="outline" disabled>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Reindexing...
                        </Button>
                    )}

                    {state === 'success' && (
                        <Button onClick={() => handleOpenChange(false)}>
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Done
                        </Button>
                    )}

                    {state === 'error' && (
                        <>
                            <Button
                                variant="outline"
                                onClick={() => handleOpenChange(false)}
                            >
                                Close
                            </Button>
                            <Button
                                onClick={handleReindex}
                                variant="destructive"
                            >
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Retry
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default ReindexDialog;
