// app/search-indexes/_components/DocumentUpload/DocumentUploadPanel.tsx

/**
 * Document Upload Panel
 *
 * A comprehensive component for uploading JSON documents to a search index.
 * Features:
 * - Drag & drop file upload
 * - JSON paste support
 * - Document preview
 * - Progress tracking
 * - Error display
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Upload,
    FileJson,
    CheckCircle2,
    AlertCircle,
    XCircle,
    Loader2,
    FileText,
    Trash2,
    Play,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useIndexDocuments, useBatchStatus, useCancelBatch } from '../../_lib/hooks';
import type { IndexingStatusResponse } from '../../_lib/api-client';

// ============================================================================
// TYPES
// ============================================================================

interface DocumentUploadPanelProps {
    searchIndexId: string;
    onComplete?: () => void;
}

interface ParsedData {
    documents: Record<string, unknown>[];
    fileName?: string;
    fileSize?: number;
}

// ============================================================================
// SUB COMPONENTS
// ============================================================================

function DropZone({
    onFileDrop,
    isDragging,
    setIsDragging,
    disabled,
}: {
    onFileDrop: (file: File) => void;
    isDragging: boolean;
    setIsDragging: (v: boolean) => void;
    disabled?: boolean;
}) {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
    }, [disabled, setIsDragging]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, [setIsDragging]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (disabled) return;

        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/json') {
            onFileDrop(file);
        } else {
            toast.error('Please upload a JSON file');
        }
    }, [disabled, onFileDrop, setIsDragging]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onFileDrop(file);
        }
        // Reset input
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    }, [onFileDrop]);

    return (
        <div
            className={cn(
                'border-2 border-dashed rounded-lg p-8 transition-colors text-center',
                isDragging && 'border-primary bg-primary/5',
                !isDragging && 'border-slate-200 hover:border-slate-300',
                disabled && 'opacity-50 cursor-not-allowed'
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <input
                ref={inputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileSelect}
                disabled={disabled}
            />

            <div className="flex flex-col items-center gap-4">
                <div className={cn(
                    'h-14 w-14 rounded-full flex items-center justify-center',
                    isDragging ? 'bg-primary/10' : 'bg-slate-100'
                )}>
                    <Upload className={cn(
                        'h-7 w-7',
                        isDragging ? 'text-primary' : 'text-slate-400'
                    )} />
                </div>

                <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-900">
                        {isDragging ? 'Drop your file here' : 'Drag & drop a JSON file'}
                    </p>
                    <p className="text-xs text-slate-500">
                        or click to browse
                    </p>
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => inputRef.current?.click()}
                >
                    <FileJson className="h-4 w-4 mr-2" />
                    Select File
                </Button>

                <p className="text-xs text-slate-400">
                    Supports JSON files up to 10MB
                </p>
            </div>
        </div>
    );
}

function DocumentPreview({
    data,
    onClear,
    disabled,
}: {
    data: ParsedData;
    onClear: () => void;
    disabled?: boolean;
}) {
    const { documents, fileName, fileSize } = data;
    const previewDoc = documents[0];

    return (
        <Card className="border-slate-200">
            <CardHeader className="py-3 px-4 border-b border-slate-100">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                            <FileText className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-900">
                                {fileName || 'Pasted JSON'}
                            </p>
                            <p className="text-xs text-slate-500">
                                {documents.length.toLocaleString()} document{documents.length !== 1 ? 's' : ''}
                                {fileSize && ` • ${(fileSize / 1024).toFixed(1)} KB`}
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClear}
                        disabled={disabled}
                        className="h-8 w-8"
                    >
                        <Trash2 className="h-4 w-4 text-slate-400" />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="p-4">
                <p className="text-xs text-slate-500 mb-2">Sample document preview:</p>
                <ScrollArea className="h-48 rounded border border-slate-100 bg-slate-50">
                    <pre className="p-3 text-xs text-slate-700 font-mono">
                        {JSON.stringify(previewDoc, null, 2)}
                    </pre>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}

function IndexingProgress({
    status,
    onCancel,
}: {
    status: IndexingStatusResponse;
    onCancel: () => void;
}) {
    const isProcessing = status.status === 'pending' || status.status === 'processing';
    const isComplete = status.status === 'completed';
    const isFailed = status.status === 'failed';

    const statusConfig = {
        pending: { icon: Loader2, color: 'text-slate-500', label: 'Preparing...' },
        processing: { icon: Loader2, color: 'text-blue-500', label: 'Indexing...' },
        completed: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Completed' },
        failed: { icon: XCircle, color: 'text-red-500', label: 'Failed' },
        cancelled: { icon: X, color: 'text-amber-500', label: 'Cancelled' },
    };

    const config = statusConfig[status.status];
    const Icon = config.icon;

    return (
        <Card className={cn(
            'border',
            isComplete && 'border-emerald-200 bg-emerald-50/30',
            isFailed && 'border-red-200 bg-red-50/30'
        )}>
            <CardContent className="p-6">
                <div className="space-y-4">
                    {/* Status header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Icon className={cn(
                                'h-5 w-5',
                                config.color,
                                isProcessing && 'animate-spin'
                            )} />
                            <div>
                                <p className="font-medium text-slate-900">{config.label}</p>
                                <p className="text-sm text-slate-500">
                                    {status.progress.indexed.toLocaleString()} of {status.progress.total.toLocaleString()} indexed
                                    {status.progress.failed > 0 && (
                                        <span className="text-red-500"> • {status.progress.failed} failed</span>
                                    )}
                                </p>
                            </div>
                        </div>

                        {isProcessing && (
                            <Button variant="outline" size="sm" onClick={onCancel}>
                                Cancel
                            </Button>
                        )}
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-2">
                        <Progress value={status.progress.percentage} className="h-2" />
                        <div className="flex justify-between text-xs text-slate-500">
                            <span>{status.progress.percentage}% complete</span>
                            {status.timing.estimatedRemainingMs && (
                                <span>~{Math.ceil(status.timing.estimatedRemainingMs / 1000)}s remaining</span>
                            )}
                            {status.timing.durationMs && !isProcessing && (
                                <span>Took {(status.timing.durationMs / 1000).toFixed(1)}s</span>
                            )}
                        </div>
                    </div>

                    {/* Summary badges */}
                    <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            {status.progress.indexed} indexed
                        </Badge>
                        {status.progress.failed > 0 && (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                {status.progress.failed} failed
                            </Badge>
                        )}
                    </div>

                    {/* Errors */}
                    {status.errors.length > 0 && (
                        <div className="mt-4">
                            <p className="text-sm font-medium text-slate-700 mb-2">
                                Errors ({status.errors.length})
                            </p>
                            <ScrollArea className="h-32 rounded border border-red-100 bg-red-50/50">
                                <div className="p-3 space-y-2">
                                    {status.errors.slice(0, 10).map((err, i) => (
                                        <div key={i} className="text-xs">
                                            <span className="text-red-600 font-mono">
                                                Doc {err.documentIndex}
                                                {err.field && ` (${err.field})`}:
                                            </span>
                                            <span className="text-slate-600 ml-1">{err.error}</span>
                                        </div>
                                    ))}
                                    {status.errors.length > 10 && (
                                        <p className="text-xs text-slate-500">
                                            ...and {status.errors.length - 10} more errors
                                        </p>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DocumentUploadPanel({
    searchIndexId,
    onComplete,
}: DocumentUploadPanelProps) {
    const [parsedData, setParsedData] = useState<ParsedData | null>(null);
    const [jsonInput, setJsonInput] = useState('');
    const [parseError, setParseError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
    const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');

    // Mutations
    const indexMutation = useIndexDocuments(searchIndexId);
    const cancelMutation = useCancelBatch(searchIndexId);

    // Batch status polling
    const { data: batchStatus } = useBatchStatus(
        searchIndexId,
        activeBatchId,
        { pollInterval: 1000 }
    );

    // Parse JSON helper
    const parseJson = useCallback((text: string, fileName?: string, fileSize?: number) => {
        setParseError(null);

        try {
            const parsed = JSON.parse(text);

            // Handle both array and single object
            const documents = Array.isArray(parsed) ? parsed : [parsed];

            if (documents.length === 0) {
                setParseError('No documents found in JSON');
                return;
            }

            // Validate documents are objects
            if (!documents.every(d => typeof d === 'object' && d !== null && !Array.isArray(d))) {
                setParseError('All documents must be JSON objects');
                return;
            }

            setParsedData({ documents, fileName, fileSize });
            setJsonInput('');
        } catch (e) {
            setParseError(e instanceof Error ? e.message : 'Invalid JSON');
        }
    }, []);

    // Handle file drop/select
    const handleFileDrop = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            parseJson(text, file.name, file.size);
        };
        reader.onerror = () => {
            setParseError('Failed to read file');
        };
        reader.readAsText(file);
    }, [parseJson]);

    // Handle paste JSON
    const handlePasteJson = useCallback(() => {
        if (!jsonInput.trim()) {
            setParseError('Please enter JSON data');
            return;
        }
        parseJson(jsonInput);
    }, [jsonInput, parseJson]);

    // Clear data
    const handleClear = useCallback(() => {
        setParsedData(null);
        setParseError(null);
        setJsonInput('');
        setActiveBatchId(null);
    }, []);

    // Start indexing
    const handleStartIndexing = useCallback(async () => {
        if (!parsedData) return;

        try {
            const result = await indexMutation.mutateAsync({
                documents: parsedData.documents,
                sourceFileName: parsedData.fileName,
            });

            // Set batch ID first, then clear parsed data
            // This ensures showProgress becomes true before we hide the preview
            setActiveBatchId(result.batchId);
            setParsedData(null);

            // Build detailed toast message
            let toastMessage = result.message;
            if (result.embeddingStats?.enabled) {
                if (result.embeddingStats.generated > 0) {
                    toastMessage += `\n✨ ${result.embeddingStats.generated} embeddings generated`;
                } else if (result.embeddingStats.skipped > 0) {
                    toastMessage += `\n⚠️ No embeddings generated (${result.embeddingStats.skipped} skipped)`;
                }
            }

            if (result.success) {
                toast.success(toastMessage, {
                    duration: 5000,
                    description: result.embeddingStats?.enabled
                        ? `Embeddings: ${result.embeddingStats.generated} generated, ${result.embeddingStats.skipped} skipped`
                        : undefined,
                });
                onComplete?.();
            } else {
                toast.warning(toastMessage, {
                    duration: 5000,
                });
            }

            // Show warnings if any
            if (result.warnings && result.warnings.length > 0) {
                result.warnings.forEach(warning => {
                    toast.warning(warning, { duration: 8000 });
                });
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Indexing failed');
        }
    }, [parsedData, indexMutation, onComplete]);

    // Cancel indexing
    const handleCancelIndexing = useCallback(async () => {
        if (!activeBatchId) return;

        try {
            await cancelMutation.mutateAsync(activeBatchId);
            toast.info('Indexing cancelled');
        } catch (error) {
            toast.error('Failed to cancel');
        }
    }, [activeBatchId, cancelMutation]);

    const isProcessing = batchStatus?.status === 'pending' || batchStatus?.status === 'processing';

    // Show progress UI when we have an active batch ID
    // This covers: waiting for status to load, processing, and completed states
    const showProgress = !!activeBatchId;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h3 className="text-lg font-semibold text-slate-900">Upload Documents</h3>
                <p className="text-sm text-slate-500">
                    Upload a JSON file or paste JSON data to index documents
                </p>
            </div>

            {/* Progress (if indexing) */}
            {showProgress && batchStatus && (
                <IndexingProgress
                    status={batchStatus}
                    onCancel={handleCancelIndexing}
                />
            )}

            {/* Loading state while waiting for batch status */}
            {showProgress && !batchStatus && (
                <Card className="border">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3">
                            <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                            <div>
                                <p className="font-medium text-slate-900">Starting indexing...</p>
                                <p className="text-sm text-slate-500">Preparing to index documents</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Upload section (hidden during progress) */}
            {!showProgress && (
                <>
                    {/* Mode toggle */}
                    <div className="flex gap-2">
                        <Button
                            variant={inputMode === 'file' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setInputMode('file')}
                        >
                            <Upload className="h-4 w-4 mr-2" />
                            Upload File
                        </Button>
                        <Button
                            variant={inputMode === 'paste' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setInputMode('paste')}
                        >
                            <FileJson className="h-4 w-4 mr-2" />
                            Paste JSON
                        </Button>
                    </div>

                    {/* File upload or JSON input */}
                    {!parsedData && inputMode === 'file' && (
                        <DropZone
                            onFileDrop={handleFileDrop}
                            isDragging={isDragging}
                            setIsDragging={setIsDragging}
                            disabled={indexMutation.isPending}
                        />
                    )}

                    {!parsedData && inputMode === 'paste' && (
                        <div className="space-y-3">
                            <Textarea
                                placeholder='Paste your JSON here... (array or single object)&#10;&#10;Example:&#10;[&#10;  { "id": "1", "title": "Document 1" },&#10;  { "id": "2", "title": "Document 2" }&#10;]'
                                value={jsonInput}
                                onChange={(e) => setJsonInput(e.target.value)}
                                className="min-h-[200px] font-mono text-sm"
                                disabled={indexMutation.isPending}
                            />
                            <Button
                                onClick={handlePasteJson}
                                disabled={!jsonInput.trim() || indexMutation.isPending}
                            >
                                Parse JSON
                            </Button>
                        </div>
                    )}

                    {/* Parse error */}
                    {parseError && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{parseError}</AlertDescription>
                        </Alert>
                    )}

                    {/* Document preview */}
                    {parsedData && (
                        <>
                            <DocumentPreview
                                data={parsedData}
                                onClear={handleClear}
                                disabled={indexMutation.isPending}
                            />

                            {/* Index button */}
                            <div className="flex justify-end gap-3">
                                <Button
                                    variant="outline"
                                    onClick={handleClear}
                                    disabled={indexMutation.isPending}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleStartIndexing}
                                    disabled={indexMutation.isPending}
                                >
                                    {indexMutation.isPending ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Starting...
                                        </>
                                    ) : (
                                        <>
                                            <Play className="h-4 w-4 mr-2" />
                                            Index {parsedData.documents.length.toLocaleString()} Documents
                                        </>
                                    )}
                                </Button>
                            </div>
                        </>
                    )}
                </>
            )}

            {/* Done button after completion */}
            {showProgress && !isProcessing && (
                <div className="flex justify-end">
                    <Button onClick={handleClear}>
                        Upload More Documents
                    </Button>
                </div>
            )}
        </div>
    );
}
