// app/search-indexes/_components/JsonSourceInput.tsx

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Upload,
    FileJson,
    ClipboardPaste,
    CheckCircle2,
    AlertCircle,
    Loader2,
    FileUp,
    Trash2,
    ChevronDown,
    ChevronUp,
    Edit2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

export interface JsonSourceInputProps {
    onJsonParsed: (json: unknown, source: 'paste' | 'upload') => void;
    onClear: () => void;
    isProcessing?: boolean;
    sourceFieldCount: number;
    recordCount: number;
    className?: string;
}

interface ParseResult {
    success: boolean;
    data?: unknown;
    error?: string;
    recordCount?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseJsonSafely(text: string): ParseResult {
    try {
        const trimmed = text.trim();
        if (!trimmed) {
            return { success: false, error: 'No JSON content provided' };
        }

        const parsed = JSON.parse(trimmed);

        if (Array.isArray(parsed)) {
            if (parsed.length === 0) {
                return { success: false, error: 'JSON array is empty' };
            }
            return { success: true, data: parsed, recordCount: parsed.length };
        }

        if (typeof parsed === 'object' && parsed !== null) {
            return { success: true, data: parsed, recordCount: 1 };
        }

        return { success: false, error: 'JSON must be an object or array of objects' };
    } catch (e) {
        const error = e as Error;
        const message = error.message || 'Invalid JSON';
        
        const positionMatch = message.match(/position (\d+)/);
        if (positionMatch) {
            return { 
                success: false, 
                error: `Invalid JSON syntax near position ${positionMatch[1]}` 
            };
        }

        return { success: false, error: message };
    }
}

// ============================================================================
// SUB COMPONENTS
// ============================================================================

interface FileDropZoneProps {
    onFileSelect: (file: File) => void;
    isLoading: boolean;
    error: string | null;
}

function FileDropZone({ onFileSelect, isLoading, error }: FileDropZoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type === 'application/json' || file.name.endsWith('.json')) {
                onFileSelect(file);
            }
        }
    }, [onFileSelect]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            onFileSelect(files[0]);
        }
    }, [onFileSelect]);

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
                'border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer',
                isDragging
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
            )}
            onClick={() => fileInputRef.current?.click()}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="hidden"
            />
            
            {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-2">
                    <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                    <span className="text-sm text-slate-600">Reading file...</span>
                </div>
            ) : (
                <div className="flex items-center justify-center gap-3 py-2">
                    <FileUp className="h-5 w-5 text-slate-400" />
                    <span className="text-sm text-slate-600">
                        Drop JSON file or click to browse
                    </span>
                </div>
            )}
            
            {error && (
                <div className="flex items-center gap-2 mt-2 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function JsonSourceInput({
    onJsonParsed,
    onClear,
    isProcessing = false,
    sourceFieldCount,
    recordCount,
    className,
}: JsonSourceInputProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [activeTab, setActiveTab] = useState<'paste' | 'upload'>('paste');
    const [jsonText, setJsonText] = useState('');
    const [parseError, setParseError] = useState<string | null>(null);
    const [isReading, setIsReading] = useState(false);
    const [isValidJson, setIsValidJson] = useState(false);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    const hasData = sourceFieldCount > 0;

    // Auto-parse JSON as user types (debounced)
    useEffect(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        const trimmed = jsonText.trim();
        if (!trimmed) {
            setParseError(null);
            setIsValidJson(false);
            return;
        }

        debounceRef.current = setTimeout(() => {
            const result = parseJsonSafely(trimmed);
            
            if (result.success && result.data) {
                setParseError(null);
                setIsValidJson(true);
                setIsExpanded(false); // Auto-collapse on valid JSON
                onJsonParsed(result.data, 'paste');
            } else {
                setParseError(result.error || 'Invalid JSON');
                setIsValidJson(false);
            }
        }, 400); // 400ms debounce

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [jsonText, onJsonParsed]);

    // Handle file select
    const handleFileSelect = useCallback(async (file: File) => {
        if (file.size > 10 * 1024 * 1024) {
            setParseError('File is too large. Maximum size is 10MB.');
            return;
        }

        setIsReading(true);
        setParseError(null);

        try {
            const text = await file.text();
            const result = parseJsonSafely(text);

            if (result.success && result.data) {
                setParseError(null);
                setJsonText(text);
                setIsValidJson(true);
                setIsExpanded(false);
                onJsonParsed(result.data, 'upload');
            } else {
                setParseError(result.error || 'Failed to parse JSON file');
                setIsValidJson(false);
            }
        } catch (e) {
            setParseError('Failed to read file');
            setIsValidJson(false);
        } finally {
            setIsReading(false);
        }
    }, [onJsonParsed]);

    // Handle clear
    const handleClear = useCallback(() => {
        setJsonText('');
        setParseError(null);
        setIsValidJson(false);
        setIsExpanded(true);
        onClear();
    }, [onClear]);

    // Handle edit (re-expand to modify)
    const handleEdit = useCallback(() => {
        setIsExpanded(true);
    }, []);

    return (
        <Card className={cn('border-slate-200', className)}>
            <CardContent className="p-4">
                {/* Header - Always visible */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            'h-10 w-10 rounded-lg flex items-center justify-center',
                            hasData ? 'bg-emerald-100' : 'bg-slate-100'
                        )}>
                            {hasData ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            ) : (
                                <FileJson className="h-5 w-5 text-slate-500" />
                            )}
                        </div>
                        <div>
                            <p className={cn(
                                'font-medium',
                                hasData ? 'text-emerald-900' : 'text-slate-900'
                            )}>
                                {hasData ? 'Source Data Loaded' : 'Source Data'}
                            </p>
                            <p className="text-sm text-slate-500">
                                {hasData 
                                    ? `${sourceFieldCount} fields from ${recordCount} record${recordCount !== 1 ? 's' : ''}`
                                    : 'Paste or upload JSON to auto-map fields'
                                }
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {hasData && (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleEdit}
                                    className="text-slate-600"
                                >
                                    <Edit2 className="h-4 w-4 mr-1" />
                                    Edit
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleClear}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Clear
                                </Button>
                            </>
                        )}
                        {!hasData && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsExpanded(!isExpanded)}
                            >
                                {isExpanded ? (
                                    <ChevronUp className="h-4 w-4" />
                                ) : (
                                    <ChevronDown className="h-4 w-4" />
                                )}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Expandable Input Section */}
                {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'paste' | 'upload')}>
                            <TabsList className="grid w-full grid-cols-2 mb-3">
                                <TabsTrigger value="paste" className="flex items-center gap-2 text-sm">
                                    <ClipboardPaste className="h-4 w-4" />
                                    Paste JSON
                                </TabsTrigger>
                                <TabsTrigger value="upload" className="flex items-center gap-2 text-sm">
                                    <Upload className="h-4 w-4" />
                                    Upload File
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="paste" className="space-y-2 mt-0">
                                <div className="relative">
                                    <Textarea
                                        placeholder='Paste JSON here... e.g. {"title": "Product", "price": 29.99}'
                                        value={jsonText}
                                        onChange={(e) => setJsonText(e.target.value)}
                                        className={cn(
                                            'font-mono text-sm h-[80px] resize-none',
                                            parseError && jsonText && 'border-red-300 focus-visible:ring-red-300',
                                            isValidJson && 'border-emerald-300 focus-visible:ring-emerald-300'
                                        )}
                                        disabled={isProcessing}
                                    />
                                    
                                    {/* Status indicator */}
                                    {jsonText && (
                                        <div className="absolute right-2 top-2">
                                            {isValidJson ? (
                                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                            ) : parseError ? (
                                                <AlertCircle className="h-4 w-4 text-red-500" />
                                            ) : (
                                                <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
                                            )}
                                        </div>
                                    )}
                                </div>
                                
                                {/* Error message */}
                                {parseError && jsonText && activeTab === 'paste' && (
                                    <p className="text-sm text-red-600 flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3" />
                                        {parseError}
                                    </p>
                                )}

                                {/* Help text */}
                                {!jsonText && (
                                    <p className="text-xs text-slate-500">
                                        JSON will be automatically parsed as you type
                                    </p>
                                )}
                            </TabsContent>

                            <TabsContent value="upload" className="mt-0">
                                <FileDropZone
                                    onFileSelect={handleFileSelect}
                                    isLoading={isReading}
                                    error={activeTab === 'upload' ? parseError : null}
                                />
                            </TabsContent>
                        </Tabs>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}