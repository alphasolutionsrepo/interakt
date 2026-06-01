// app/search-indexes/_components/FieldMappingJsonEditor.tsx

/**
 * Field Mapping JSON Editor
 *
 * Displays field mappings as editable JSON. Validates on edit, and
 * "Apply" pushes changes back to the parent page's shared state.
 */

'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    CheckCircle2,
    AlertCircle,
    AlertTriangle,
    RotateCcw,
    Check,
    FileText,
} from 'lucide-react';
import type { SearchIndexField } from '@/features/search-index';
import type { FieldAttributeChange } from './FieldMappingTable';
import {
    fieldsToJson,
    jsonToMappingsAndChanges,
    validateFieldMappingsJson,
    computeDiffSummary,
    type FieldMappingsJson,
    type DiffSummary,
} from '../_lib/utils/field-mappings-json';

// Internal FieldMapping type (matches page.tsx)
interface FieldMapping {
    fieldId: number;
    sourceFieldPath: string | null;
    mappingConfig?: import('@/features/search-index').FieldMappingConfig;
    isAutoMapped?: boolean;
    isVectorSource?: boolean;
}

interface FieldMappingJsonEditorProps {
    fields: SearchIndexField[];
    localMappings: FieldMapping[];
    pendingAttributeChanges: Map<number, FieldAttributeChange>;
    searchIndex: {
        name: string;
        searchProvider: string;
    };
    onApply: (localMappings: FieldMapping[], pendingAttributeChanges: Map<number, FieldAttributeChange>) => void;
    isLoading?: boolean;
}

export function FieldMappingJsonEditor({
    fields,
    localMappings,
    pendingAttributeChanges,
    searchIndex,
    onApply,
    isLoading,
}: FieldMappingJsonEditorProps) {
    const [jsonText, setJsonText] = useState('');
    const [parseError, setParseError] = useState<string | null>(null);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [conversionWarnings, setConversionWarnings] = useState<string[]>([]);
    const [isDirty, setIsDirty] = useState(false);
    const [diffSummary, setDiffSummary] = useState<DiffSummary | null>(null);
    const [applied, setApplied] = useState(false);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Derive JSON from current state
    const derivedJson = useMemo(() => {
        if (!fields.length) return '';
        const json = fieldsToJson(fields, localMappings, pendingAttributeChanges, {
            name: searchIndex.name,
            searchProvider: searchIndex.searchProvider,
        });
        return JSON.stringify(json, null, 2);
    }, [fields, localMappings, pendingAttributeChanges, searchIndex]);

    // Set initial text (and re-derive when not dirty)
    useEffect(() => {
        if (!isDirty && derivedJson) {
            setJsonText(derivedJson);
            setParseError(null);
            setValidationErrors([]);
            setConversionWarnings([]);
            setDiffSummary(null);
        }
    }, [derivedJson, isDirty]);

    // Debounced validation on text change
    const validateText = useCallback((text: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(() => {
            try {
                const parsed = JSON.parse(text);
                setParseError(null);

                const validation = validateFieldMappingsJson(parsed);
                setValidationErrors(validation.errors);

                if (validation.valid && fields.length > 0) {
                    const diff = computeDiffSummary(parsed as FieldMappingsJson, fields, localMappings);
                    setDiffSummary(diff);

                    // Preview conversion warnings
                    const result = jsonToMappingsAndChanges(parsed as FieldMappingsJson, fields);
                    setConversionWarnings(result.warnings);
                } else {
                    setDiffSummary(null);
                    setConversionWarnings([]);
                }
            } catch (e) {
                const msg = e instanceof SyntaxError ? e.message : 'Invalid JSON';
                setParseError(msg);
                setValidationErrors([]);
                setDiffSummary(null);
                setConversionWarnings([]);
            }
        }, 500);
    }, [fields, localMappings]);

    const handleTextChange = useCallback((text: string) => {
        setJsonText(text);
        setIsDirty(true);
        setApplied(false);
        validateText(text);
    }, [validateText]);

    const handleReset = useCallback(() => {
        setJsonText(derivedJson);
        setIsDirty(false);
        setApplied(false);
        setParseError(null);
        setValidationErrors([]);
        setConversionWarnings([]);
        setDiffSummary(null);
    }, [derivedJson]);

    const handleApply = useCallback(() => {
        try {
            const parsed = JSON.parse(jsonText) as FieldMappingsJson;
            const validation = validateFieldMappingsJson(parsed);
            if (!validation.valid) {
                setValidationErrors(validation.errors);
                return;
            }

            const result = jsonToMappingsAndChanges(parsed, fields);
            if (result.errors.length > 0) {
                setValidationErrors(result.errors);
                setConversionWarnings(result.warnings);
                return;
            }

            onApply(result.localMappings, result.pendingAttributeChanges);
            setIsDirty(false);
            setApplied(true);
            setConversionWarnings(result.warnings);

            // Clear after brief display
            setTimeout(() => setApplied(false), 2000);
        } catch (e) {
            const msg = e instanceof SyntaxError ? e.message : 'Failed to parse JSON';
            setParseError(msg);
        }
    }, [jsonText, fields, onApply]);

    const isValid = !parseError && validationErrors.length === 0;
    const canApply = isDirty && isValid;
    const fieldCount = (() => {
        try { return (JSON.parse(jsonText) as FieldMappingsJson).fields?.length ?? 0; } catch { return 0; }
    })();

    if (isLoading) {
        return (
            <div className="space-y-3">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-6 bg-slate-100 rounded animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {/* Status */}
                    {parseError && (
                        <Badge variant="destructive" className="gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Parse Error
                        </Badge>
                    )}
                    {!parseError && validationErrors.length > 0 && (
                        <Badge variant="destructive" className="gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {validationErrors.length} error{validationErrors.length !== 1 ? 's' : ''}
                        </Badge>
                    )}
                    {isValid && !isDirty && !applied && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {fieldCount} fields
                        </Badge>
                    )}
                    {isValid && isDirty && (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1">
                            <FileText className="h-3 w-3" />
                            Modified — {fieldCount} fields
                        </Badge>
                    )}
                    {applied && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                            <Check className="h-3 w-3" />
                            Applied
                        </Badge>
                    )}
                    {conversionWarnings.length > 0 && isValid && (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {conversionWarnings.length} warning{conversionWarnings.length !== 1 ? 's' : ''}
                        </Badge>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {isDirty && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleReset}
                        >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Reset
                        </Button>
                    )}
                    <Button
                        size="sm"
                        onClick={handleApply}
                        disabled={!canApply}
                    >
                        <Check className="h-4 w-4 mr-1" />
                        Apply Changes
                    </Button>
                </div>
            </div>

            {/* Error Details */}
            {parseError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <p className="font-medium">JSON Parse Error</p>
                    <p className="mt-1 font-mono text-xs">{parseError}</p>
                </div>
            )}
            {!parseError && validationErrors.length > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <p className="font-medium">Validation Errors</p>
                    <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs">
                        {validationErrors.map((err, i) => (
                            <li key={i}>{err}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Diff Summary */}
            {isDirty && isValid && diffSummary && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                    <div className="flex items-center gap-4 flex-wrap">
                        <span>{diffSummary.matchedFields} of {diffSummary.totalFields} fields matched</span>
                        {diffSummary.mappingChanges > 0 && (
                            <span className="font-medium">{diffSummary.mappingChanges} mapping change{diffSummary.mappingChanges !== 1 ? 's' : ''}</span>
                        )}
                        {diffSummary.attributeChanges > 0 && (
                            <span className="font-medium">{diffSummary.attributeChanges} attribute change{diffSummary.attributeChanges !== 1 ? 's' : ''}</span>
                        )}
                        {diffSummary.fieldsToCreate > 0 && (
                            <span className="text-emerald-600">{diffSummary.fieldsToCreate} field{diffSummary.fieldsToCreate !== 1 ? 's' : ''} to create</span>
                        )}
                    </div>
                </div>
            )}

            {/* Warnings */}
            {conversionWarnings.length > 0 && isValid && isDirty && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                    <p className="font-medium">Warnings</p>
                    <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs max-h-24 overflow-y-auto">
                        {conversionWarnings.slice(0, 10).map((w, i) => (
                            <li key={i}>{w}</li>
                        ))}
                        {conversionWarnings.length > 10 && (
                            <li>... and {conversionWarnings.length - 10} more</li>
                        )}
                    </ul>
                </div>
            )}

            {/* JSON Textarea */}
            <Textarea
                value={jsonText}
                onChange={(e) => handleTextChange(e.target.value)}
                className="font-mono text-xs leading-relaxed min-h-[500px] resize-y bg-slate-50 border-slate-200"
                spellCheck={false}
            />
        </div>
    );
}
