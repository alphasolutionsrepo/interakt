// app/search-indexes/_components/FieldInferenceReviewDialog.tsx

/**
 * Field Inference Review Dialog
 *
 * Shown after the user pastes/uploads sample JSON. Displays all inferred fields
 * with their detected types, sample values, and lets the user:
 *  - Edit field types before creation (dropdown)
 *  - Edit display names
 *  - Toggle searchable/facetable defaults
 *  - Exclude fields they don't want
 *  - See which fields already exist (shown as "existing", skipped)
 *
 * Only after the user confirms are fields created in the DB.
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    CheckCircle2,
    Loader2,
    AlertCircle,
    Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FIELD_TYPES, FIELD_TYPE_INFO } from '@/shared/constants/field-types';

// ============================================================================
// TYPES
// ============================================================================

export interface InferredField {
    /** Field name/path from JSON */
    fieldName: string;
    /** Auto-detected type */
    inferredType: string;
    /** Human-readable display name */
    displayName: string;
    /** Sample value for preview */
    sampleValue: unknown;
    /** Whether a field with this name already exists on the index */
    alreadyExists: boolean;
    /** Nesting depth (0 = root) */
    depth: number;
}

export interface ReviewedField {
    fieldName: string;
    fieldType: string;
    displayName: string;
    included: boolean;
}

interface FieldInferenceReviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Inferred fields from JSON analysis */
    inferredFields: InferredField[];
    /** Callback when user confirms — receives the reviewed fields to create */
    onConfirm: (fields: ReviewedField[]) => void;
    /** Whether creation is in progress */
    isCreating?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function getFieldTypeBadgeColor(fieldType: string): string {
    const colors: Record<string, string> = {
        text: 'bg-blue-50 text-blue-700 border-blue-200',
        keyword: 'bg-violet-50 text-violet-700 border-violet-200',
        number: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        boolean: 'bg-amber-50 text-amber-700 border-amber-200',
        datetime: 'bg-pink-50 text-pink-700 border-pink-200',
        date: 'bg-pink-50 text-pink-700 border-pink-200',
        json: 'bg-slate-100 text-slate-700 border-slate-300',
        array: 'bg-orange-50 text-orange-700 border-orange-200',
        image_url: 'bg-teal-50 text-teal-700 border-teal-200',
        url: 'bg-cyan-50 text-cyan-700 border-cyan-200',
        email: 'bg-rose-50 text-rose-700 border-rose-200',
    };
    return colors[fieldType] || 'bg-slate-50 text-slate-600 border-slate-200';
}

function formatSampleValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') {
        return value.length > 60 ? `"${value.slice(0, 57)}..."` : `"${value}"`;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const first = typeof value[0] === 'object' ? '{...}' : JSON.stringify(value[0]);
        return `[${first}, ...] (${value.length} items)`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value);
        return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', ...' : ''}}`;
    }
    return String(value);
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FieldInferenceReviewDialog({
    open,
    onOpenChange,
    inferredFields,
    onConfirm,
    isCreating = false,
}: FieldInferenceReviewDialogProps) {
    // Local editable state for each field
    const [editState, setEditState] = useState<Map<string, ReviewedField>>(new Map());

    // Initialize edit state when fields change
    useMemo(() => {
        const state = new Map<string, ReviewedField>();
        for (const field of inferredFields) {
            state.set(field.fieldName, {
                fieldName: field.fieldName,
                fieldType: field.inferredType,
                displayName: field.displayName,
                included: !field.alreadyExists, // exclude existing fields by default
            });
        }
        setEditState(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inferredFields]);

    const updateField = useCallback((fieldName: string, updates: Partial<ReviewedField>) => {
        setEditState(prev => {
            const next = new Map(prev);
            const existing = next.get(fieldName);
            if (existing) {
                next.set(fieldName, { ...existing, ...updates });
            }
            return next;
        });
    }, []);

    const toggleAll = useCallback((included: boolean) => {
        setEditState(prev => {
            const next = new Map(prev);
            for (const [name, field] of next) {
                const inferred = inferredFields.find(f => f.fieldName === name);
                if (inferred && !inferred.alreadyExists) {
                    next.set(name, { ...field, included });
                }
            }
            return next;
        });
    }, [inferredFields]);

    // Stats
    const newFields = inferredFields.filter(f => !f.alreadyExists);
    const existingFields = inferredFields.filter(f => f.alreadyExists);
    const selectedCount = Array.from(editState.values()).filter(f => f.included).length;

    const handleConfirm = () => {
        const fieldsToCreate = Array.from(editState.values()).filter(f => f.included);
        onConfirm(fieldsToCreate);
    };

    return (
        <Dialog open={open} onOpenChange={isCreating ? undefined : onOpenChange}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0">
                <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-violet-500" />
                        Review Inferred Fields
                    </DialogTitle>
                    <DialogDescription>
                        {newFields.length} new field{newFields.length !== 1 ? 's' : ''} detected from your sample data.
                        {existingFields.length > 0 && (
                            <> {existingFields.length} field{existingFields.length !== 1 ? 's' : ''} already exist and will be skipped.</>
                        )}
                        {' '}Review and adjust types before creating.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-auto border-y">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50/80">
                                <TableHead className="w-10">
                                    <Checkbox
                                        checked={selectedCount === newFields.length && newFields.length > 0}
                                        onCheckedChange={(checked) => toggleAll(!!checked)}
                                        disabled={isCreating}
                                    />
                                </TableHead>
                                <TableHead className="font-semibold w-[180px]">Field Name</TableHead>
                                <TableHead className="font-semibold w-[140px]">Type</TableHead>
                                <TableHead className="font-semibold w-[160px]">Display Name</TableHead>
                                <TableHead className="font-semibold">Sample Value</TableHead>
                                <TableHead className="font-semibold w-[80px]">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {inferredFields.map((field) => {
                                const edit = editState.get(field.fieldName);
                                if (!edit) return null;

                                return (
                                    <TableRow
                                        key={field.fieldName}
                                        className={cn(
                                            field.alreadyExists && 'opacity-50',
                                            !edit.included && !field.alreadyExists && 'opacity-60',
                                        )}
                                    >
                                        <TableCell>
                                            <Checkbox
                                                checked={edit.included}
                                                onCheckedChange={(checked) =>
                                                    updateField(field.fieldName, { included: !!checked })
                                                }
                                                disabled={field.alreadyExists || isCreating}
                                            />
                                        </TableCell>

                                        <TableCell>
                                            <span className="font-mono text-sm text-slate-800">
                                                {field.fieldName}
                                            </span>
                                        </TableCell>

                                        <TableCell>
                                            {field.alreadyExists ? (
                                                <Badge
                                                    variant="outline"
                                                    className={cn('text-xs', getFieldTypeBadgeColor(edit.fieldType))}
                                                >
                                                    {edit.fieldType}
                                                </Badge>
                                            ) : (
                                                <Select
                                                    value={edit.fieldType}
                                                    onValueChange={(value) =>
                                                        updateField(field.fieldName, { fieldType: value })
                                                    }
                                                    disabled={isCreating}
                                                >
                                                    <SelectTrigger className="h-8 text-xs w-[130px]">
                                                        <Badge
                                                            variant="outline"
                                                            className={cn('text-[10px] px-1.5 font-mono', getFieldTypeBadgeColor(edit.fieldType))}
                                                        >
                                                            {edit.fieldType}
                                                        </Badge>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {FIELD_TYPES.map((type) => (
                                                            <SelectItem key={type} value={type} className="text-xs">
                                                                <div className="flex items-center gap-2">
                                                                    <Badge
                                                                        variant="outline"
                                                                        className={cn('text-[9px] px-1 font-mono', getFieldTypeBadgeColor(type))}
                                                                    >
                                                                        {type}
                                                                    </Badge>
                                                                    <span className="text-muted-foreground">
                                                                        {FIELD_TYPE_INFO[type]?.label}
                                                                    </span>
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </TableCell>

                                        <TableCell>
                                            {field.alreadyExists ? (
                                                <span className="text-sm text-slate-500">{edit.displayName}</span>
                                            ) : (
                                                <Input
                                                    value={edit.displayName}
                                                    onChange={(e) =>
                                                        updateField(field.fieldName, { displayName: e.target.value })
                                                    }
                                                    className="h-8 text-sm"
                                                    disabled={isCreating}
                                                />
                                            )}
                                        </TableCell>

                                        <TableCell>
                                            <span className="text-xs text-slate-500 font-mono truncate block max-w-[200px]">
                                                {formatSampleValue(field.sampleValue)}
                                            </span>
                                        </TableCell>

                                        <TableCell>
                                            {field.alreadyExists ? (
                                                <Badge variant="outline" className="text-xs bg-slate-100 text-slate-500">
                                                    Exists
                                                </Badge>
                                            ) : edit.included ? (
                                                <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                                                    <CheckCircle2 className="h-3 w-3 mr-0.5" />
                                                    New
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-xs bg-slate-50 text-slate-400">
                                                    Skipped
                                                </Badge>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>

                {/* Footer — pinned at bottom */}
                <div className="shrink-0 px-6 py-4 space-y-3">
                    {/* Type correction hint */}
                    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>
                            Types are auto-detected from sample values. Adjust any that look wrong
                            &mdash; e.g. short strings may show as <code className="text-[10px] bg-slate-200 px-1 rounded">keyword</code> when
                            they should be <code className="text-[10px] bg-slate-200 px-1 rounded">text</code> for full-text search.
                        </span>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                            {selectedCount} of {newFields.length} fields selected
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                onClick={() => onOpenChange(false)}
                                disabled={isCreating}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleConfirm}
                                disabled={selectedCount === 0 || isCreating}
                            >
                                {isCreating ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        Create {selectedCount} Field{selectedCount !== 1 ? 's' : ''}
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
