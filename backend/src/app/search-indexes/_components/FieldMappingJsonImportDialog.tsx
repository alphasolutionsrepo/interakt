// app/search-indexes/_components/FieldMappingJsonImportDialog.tsx

/**
 * Field Mapping JSON Import Dialog
 *
 * Allows importing field mappings from a JSON file or pasted text.
 * Shows a preview/diff before applying changes.
 */

'use client';

import { useState, useCallback } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Upload,
    FileJson,
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { reportActionError } from '@/shared/activity/report';
import type { SearchIndexField } from '@/features/search-index';
import type { FieldAttributeChange } from './FieldMappingTable';
import {
    validateFieldMappingsJson,
    jsonToMappingsAndChanges,
    computeDiffSummary,
    type FieldMappingsJson,
    type DiffSummary,
} from '../_lib/utils/field-mappings-json';
import { searchIndexFieldsApi } from '../_lib/api-client';

// Internal FieldMapping type (matches page.tsx)
interface FieldMapping {
    fieldId: number;
    sourceFieldPath: string | null;
    mappingConfig?: import('@/features/search-index').FieldMappingConfig;
    isAutoMapped?: boolean;
    isVectorSource?: boolean;
}

interface FieldMappingJsonImportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fields: SearchIndexField[];
    localMappings: FieldMapping[];
    onImport: (localMappings: FieldMapping[], pendingAttributeChanges: Map<number, FieldAttributeChange>) => void;
    /**
     * Search index ID — used when the JSON contains fields not yet in the index,
     * so the dialog can POST them to /fields/from-mapping before computing the
     * final mapping/attribute changes.
     */
    searchIndexId: string;
    /**
     * Called after fields have been created on the server. Should refetch the
     * field list and return the fresh array. The dialog re-runs the JSON
     * conversion against the new list so the imported mapping is applied
     * to the just-created fields too.
     */
    refetchFields: () => Promise<SearchIndexField[]>;
}

export function FieldMappingJsonImportDialog({
    open,
    onOpenChange,
    fields,
    localMappings,
    onImport,
    searchIndexId,
    refetchFields,
}: FieldMappingJsonImportDialogProps) {
    const [jsonText, setJsonText] = useState('');
    const [parseError, setParseError] = useState<string | null>(null);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [conversionErrors, setConversionErrors] = useState<string[]>([]);
    const [conversionWarnings, setConversionWarnings] = useState<string[]>([]);
    const [diffSummary, setDiffSummary] = useState<DiffSummary | null>(null);
    const [parsedJson, setParsedJson] = useState<FieldMappingsJson | null>(null);
    const [isApplying, setIsApplying] = useState(false);

    const reset = useCallback(() => {
        setJsonText('');
        setParseError(null);
        setValidationErrors([]);
        setConversionErrors([]);
        setConversionWarnings([]);
        setDiffSummary(null);
        setParsedJson(null);
        setIsApplying(false);
    }, []);

    const processJson = useCallback((text: string) => {
        setJsonText(text);
        setConversionErrors([]);
        setConversionWarnings([]);
        setDiffSummary(null);
        setParsedJson(null);

        if (!text.trim()) {
            setParseError(null);
            setValidationErrors([]);
            return;
        }

        try {
            const parsed = JSON.parse(text);
            setParseError(null);

            const validation = validateFieldMappingsJson(parsed);
            setValidationErrors(validation.errors);

            if (validation.valid && fields.length > 0) {
                const json = parsed as FieldMappingsJson;
                setParsedJson(json);

                const diff = computeDiffSummary(json, fields, localMappings);
                setDiffSummary(diff);

                const result = jsonToMappingsAndChanges(json, fields);
                setConversionErrors(result.errors);
                setConversionWarnings(result.warnings);
            }
        } catch (e) {
            setParseError(e instanceof SyntaxError ? e.message : 'Invalid JSON');
            setValidationErrors([]);
        }
    }, [fields, localMappings]);

    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            processJson(text);
        };
        reader.readAsText(file);
        // Reset input so same file can be re-selected
        e.target.value = '';
    }, [processJson]);

    const handleApplyImport = useCallback(async () => {
        if (!parsedJson) return;

        const initial = jsonToMappingsAndChanges(parsedJson, fields);
        if (initial.errors.length > 0) {
            setConversionErrors(initial.errors);
            return;
        }

        // If the JSON has entries that don't match existing fields, create
        // them first so the import can complete fully.
        let workingFields = fields;
        if (initial.fieldsToCreate.length > 0) {
            setIsApplying(true);
            try {
                const result = await searchIndexFieldsApi.createFieldsFromMapping(
                    searchIndexId,
                    initial.fieldsToCreate,
                );
                if (result.errors.length > 0) {
                    reportActionError(
                        'Create fields',
                        `Created ${result.createdCount} field(s); ${result.errorCount} failed: ${result.errors.map((e) => `${e.fieldName}: ${e.error}`).join('; ')}`,
                    );
                } else {
                    toast.success(`Created ${result.createdCount} new field(s)`);
                }
                // Pull the fresh field list so the new fields are mapped too
                workingFields = await refetchFields();
            } catch (e) {
                reportActionError('Create fields', e);
                setIsApplying(false);
                return;
            }
        }

        // Re-run the conversion against the (possibly enlarged) field list so
        // the just-created fields also get their mapping + attribute changes.
        const finalResult = jsonToMappingsAndChanges(parsedJson, workingFields);
        if (finalResult.errors.length > 0) {
            setConversionErrors(finalResult.errors);
            setIsApplying(false);
            return;
        }

        onImport(finalResult.localMappings, finalResult.pendingAttributeChanges);
        reset();
        onOpenChange(false);
    }, [parsedJson, fields, onImport, reset, onOpenChange, searchIndexId, refetchFields]);

    const handleClose = useCallback(() => {
        reset();
        onOpenChange(false);
    }, [reset, onOpenChange]);

    const isValid = !parseError && validationErrors.length === 0 && conversionErrors.length === 0;
    const canApply = parsedJson !== null && isValid;
    const allErrors = [...validationErrors, ...conversionErrors];

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileJson className="h-5 w-5" />
                        Import Field Mappings
                    </DialogTitle>
                    <DialogDescription>
                        Paste or upload a field mappings JSON file to restore a previous configuration.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="paste" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="paste">Paste JSON</TabsTrigger>
                        <TabsTrigger value="upload">Upload File</TabsTrigger>
                    </TabsList>

                    <TabsContent value="paste" className="mt-3">
                        <Textarea
                            value={jsonText}
                            onChange={(e) => processJson(e.target.value)}
                            placeholder='Paste field mappings JSON here...'
                            className="font-mono text-xs leading-relaxed min-h-[250px] resize-y bg-slate-50 dark:bg-muted/40"
                            spellCheck={false}
                        />
                    </TabsContent>

                    <TabsContent value="upload" className="mt-3">
                        <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-300 dark:border-border rounded-lg cursor-pointer bg-slate-50 dark:bg-muted/40 hover:bg-slate-100 transition-colors">
                            <div className="flex flex-col items-center gap-2 text-slate-500">
                                <Upload className="h-8 w-8" />
                                <span className="text-sm font-medium">Click to upload .json file</span>
                                <span className="text-xs">or drag and drop</span>
                            </div>
                            <input
                                type="file"
                                accept=".json,application/json"
                                className="hidden"
                                onChange={handleFileUpload}
                            />
                        </label>
                        {jsonText && (
                            <div className="mt-2 text-xs text-slate-500">
                                File loaded — {jsonText.length.toLocaleString()} characters
                            </div>
                        )}
                    </TabsContent>
                </Tabs>

                {/* Errors */}
                {parseError && (
                    <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            <p className="font-medium">JSON Parse Error</p>
                        </div>
                        <p className="mt-1 font-mono text-xs">{parseError}</p>
                    </div>
                )}
                {allErrors.length > 0 && !parseError && (
                    <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            <p className="font-medium">{allErrors.length} error{allErrors.length !== 1 ? 's' : ''}</p>
                        </div>
                        <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs">
                            {allErrors.map((err, i) => <li key={i}>{err}</li>)}
                        </ul>
                    </div>
                )}

                {/* Preview */}
                {isValid && diffSummary && (
                    <div className="space-y-2">
                        <div className="rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3">
                            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                                <span className="font-medium">Valid configuration</span>
                            </div>
                            <div className="mt-2 flex items-center gap-3 flex-wrap text-xs text-emerald-600">
                                <Badge className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                                    {diffSummary.matchedFields} of {diffSummary.totalFields} fields matched
                                </Badge>
                                {diffSummary.fieldsToCreate > 0 && (
                                    <Badge className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                                        {diffSummary.fieldsToCreate} field{diffSummary.fieldsToCreate !== 1 ? 's' : ''} to create
                                    </Badge>
                                )}
                                {diffSummary.mappingChanges > 0 && (
                                    <Badge className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                                        {diffSummary.mappingChanges} mapping change{diffSummary.mappingChanges !== 1 ? 's' : ''}
                                    </Badge>
                                )}
                                {diffSummary.attributeChanges > 0 && (
                                    <Badge className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                                        {diffSummary.attributeChanges} attribute change{diffSummary.attributeChanges !== 1 ? 's' : ''}
                                    </Badge>
                                )}
                            </div>
                            {parsedJson?._indexName && (
                                <p className="mt-2 text-xs text-emerald-600">
                                    From index: <span className="font-medium">{parsedJson._indexName}</span>
                                    {parsedJson._exportedAt && (
                                        <span> — exported {new Date(parsedJson._exportedAt).toLocaleString()}</span>
                                    )}
                                </p>
                            )}
                        </div>

                        {/* Warnings */}
                        {conversionWarnings.length > 0 && (
                            <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-700 dark:text-amber-300">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                                    <p className="font-medium">{conversionWarnings.length} warning{conversionWarnings.length !== 1 ? 's' : ''}</p>
                                </div>
                                <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs max-h-24 overflow-y-auto">
                                    {conversionWarnings.slice(0, 10).map((w, i) => <li key={i}>{w}</li>)}
                                    {conversionWarnings.length > 10 && (
                                        <li>... and {conversionWarnings.length - 10} more</li>
                                    )}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="ghost" onClick={handleClose} disabled={isApplying}>
                        Cancel
                    </Button>
                    <Button onClick={handleApplyImport} disabled={!canApply || isApplying}>
                        {isApplying ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                            <Upload className="h-4 w-4 mr-1" />
                        )}
                        {isApplying ? 'Applying…' : 'Apply Import'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
