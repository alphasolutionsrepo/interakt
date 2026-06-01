// app/search-indexes/_components/ImportWizard/StepUpload.tsx

/**
 * Step 1: Upload File
 *
 * Handles file selection, JSON parsing, and displays preview info.
 */

'use client';

import { useRef, useCallback, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Upload,
    FileJson,
    Loader2,
    AlertCircle,
    CheckCircle2,
    Database,
    Layers,
} from 'lucide-react';
import { SEARCH_TYPE_INFO } from '@/features/search-index';
import type { SearchIndexImportPreview } from '../../_lib/api-client';

// ============================================================================
// TYPES
// ============================================================================

interface StepUploadProps {
    onFileLoaded: (data: unknown) => Promise<void>;
    isLoading: boolean;
    error: string | null;
    preview: SearchIndexImportPreview | null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StepUpload({ onFileLoaded, isLoading, error, preview }: StepUploadProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);

    // ========================================================================
    // FILE HANDLING
    // ========================================================================

    const processFile = useCallback(async (file: File) => {
        setParseError(null);
        setFileName(file.name);

        try {
            const text = await file.text();
            const json = JSON.parse(text);
            await onFileLoaded(json);
        } catch (err) {
            if (err instanceof SyntaxError) {
                setParseError('Invalid JSON file. Please check the file format.');
            } else {
                // Let parent handle API errors
                throw err;
            }
        }
    }, [onFileLoaded]);

    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await processFile(file);
        // Reset input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [processFile]);

    // ========================================================================
    // DRAG & DROP
    // ========================================================================

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files[0];
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            setParseError('Please select a JSON file');
            return;
        }

        await processFile(file);
    }, [processFile]);

    const displayError = parseError || error;

    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <div className="space-y-8">
            {/* Upload Zone */}
            <div className="space-y-3">
                <Label className="text-lg font-semibold">Select JSON File</Label>
                <p className="text-sm text-muted-foreground">
                    Upload a search index export file (.json) to import its configuration.
                </p>

                <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`
                        relative mt-4 p-12 border-2 border-dashed rounded-2xl
                        flex flex-col items-center justify-center gap-4
                        cursor-pointer transition-all duration-200
                        ${isDragging
                            ? 'border-primary bg-primary/5'
                            : displayError
                                ? 'border-destructive/50 bg-destructive/5'
                                : preview
                                    ? 'border-emerald-500/50 bg-emerald-500/5'
                                    : 'border-border/60 hover:border-primary/50 hover:bg-muted/30'
                        }
                    `}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleFileSelect}
                        className="hidden"
                        disabled={isLoading}
                    />

                    {isLoading ? (
                        <>
                            <Loader2 className="h-12 w-12 text-primary animate-spin" />
                            <p className="text-base text-muted-foreground">Analyzing file...</p>
                        </>
                    ) : preview ? (
                        <>
                            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                            <p className="text-base font-medium text-emerald-600 dark:text-emerald-400">
                                File loaded successfully
                            </p>
                            {fileName && (
                                <p className="text-sm text-muted-foreground">{fileName}</p>
                            )}
                            <p className="text-sm text-muted-foreground">
                                Click or drag to replace
                            </p>
                        </>
                    ) : (
                        <>
                            <Upload className="h-12 w-12 text-muted-foreground" />
                            <div className="text-center">
                                <p className="text-base font-medium">
                                    Drop your file here, or click to browse
                                </p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Supports .json files
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Error Display */}
            {displayError && (
                <Alert variant="destructive" className="rounded-xl">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{displayError}</AlertDescription>
                </Alert>
            )}

            {/* Preview Info */}
            {preview && (
                <div className="space-y-5 border rounded-2xl p-6 bg-muted/20">
                    <div className="flex items-center gap-3">
                        <FileJson className="h-6 w-6 text-primary" />
                        <h4 className="font-semibold text-lg">Import Preview</h4>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        {/* Display Name */}
                        <div className="space-y-1.5">
                            <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">
                                Display Name
                            </span>
                            <p className="font-medium text-base">{preview.searchIndex.displayName}</p>
                        </div>

                        {/* Index Name */}
                        <div className="space-y-1.5">
                            <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">
                                Index Name
                            </span>
                            <div className="flex items-center gap-2">
                                <code className="text-sm bg-muted px-2.5 py-1 rounded-lg font-mono">
                                    {preview.searchIndex.name}
                                </code>
                                {preview.searchIndex.nameConflict && (
                                    <Badge variant="destructive" className="text-xs">
                                        Conflict
                                    </Badge>
                                )}
                            </div>
                        </div>

                        {/* Search Type */}
                        <div className="space-y-1.5">
                            <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">
                                Search Type
                            </span>
                            <div>
                                <Badge variant="secondary" className="rounded-lg text-sm px-3 py-1">
                                    {SEARCH_TYPE_INFO[preview.searchIndex.searchType as keyof typeof SEARCH_TYPE_INFO]?.label || preview.searchIndex.searchType}
                                </Badge>
                            </div>
                        </div>

                        {/* Field Count */}
                        <div className="space-y-1.5">
                            <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">
                                Fields
                            </span>
                            <div className="flex items-center gap-2">
                                <Layers className="h-5 w-5 text-muted-foreground" />
                                <span className="font-medium text-base">{preview.fieldCount} fields</span>
                            </div>
                        </div>
                    </div>

                    {/* Template Status */}
                    <div className="flex items-center gap-3 pt-4 border-t border-border/50">
                        <Database className="h-5 w-5 text-muted-foreground" />
                        <span className="text-muted-foreground">Template:</span>
                        {preview.template.found ? (
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                <span className="font-medium">{preview.template.matchedTemplateName}</span>
                                <Badge variant="outline" className="text-xs">matched</Badge>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <AlertCircle className="h-5 w-5 text-amber-500" />
                                <span className="text-muted-foreground">
                                    Template &quot;{preview.template.slug}&quot; not found
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Warnings */}
                    {preview.warnings.length > 0 && (
                        <Alert className="mt-4 rounded-xl border-amber-500/50 bg-amber-500/10">
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                            <AlertDescription className="text-amber-700 dark:text-amber-400">
                                <ul className="list-disc list-inside space-y-1">
                                    {preview.warnings.map((warning, i) => (
                                        <li key={i}>{warning}</li>
                                    ))}
                                </ul>
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
            )}
        </div>
    );
}
