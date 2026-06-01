// app/search-indexes/_components/AddFieldDialog.tsx

/**
 * Add Field Dialog
 *
 * Single-form dialog for adding one custom field to a search index after
 * the index already exists. Lets the user define the full field shape —
 * name, type, source / static / computed / reference mapping, attributes —
 * in one shot, without bulk-loading data or importing a mapping JSON.
 *
 * Pairs with searchIndexFieldsApi.createField() (which after the recent
 * refactor accepts the full mapping config + sourceFieldPath).
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Plus, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { SearchIndexField } from '@/features/search-index';
import { searchIndexFieldsApi } from '../_lib/api-client';
import { FIELD_TYPES, FIELD_TYPE_INFO, type FieldType } from '@/shared/constants/field-types';
import {
    MAPPING_MODE_INFO,
    COMPUTED_AGGREGATIONS,
    GENERATOR_TYPES,
    type MappingMode,
    type ComputedAggregation,
    type GeneratorType,
} from '@/shared/constants/search-index.constants';

// Subset of modes we surface in the UI. `default` and `collect` are advanced /
// rarely used as standalone choices for new fields; they're achievable via the
// JSON import path if needed.
const ALLOWED_MODES: MappingMode[] = ['source', 'static', 'computed', 'reference', 'generated', 'none'];

interface AddFieldDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    searchIndexId: string;
    existingFields: SearchIndexField[];
    onCreated: (field: SearchIndexField) => void;
}

function deriveDisplayName(fieldName: string): string {
    if (!fieldName) return '';
    const last = fieldName.includes('.') ? fieldName.split('.').pop()! : fieldName;
    return last
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

const FIELD_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export function AddFieldDialog({
    open,
    onOpenChange,
    searchIndexId,
    existingFields,
    onCreated,
}: AddFieldDialogProps) {
    // Identity
    const [fieldName, setFieldName] = useState('');
    const [fieldType, setFieldType] = useState<FieldType>('keyword');
    const [displayName, setDisplayName] = useState('');
    const [displayNameTouched, setDisplayNameTouched] = useState(false);

    // Mapping
    const [mode, setMode] = useState<MappingMode>('source');
    const [sourceField, setSourceField] = useState('');
    const [staticValue, setStaticValue] = useState('');
    const [sourceArrayPath, setSourceArrayPath] = useState('');
    const [extractField, setExtractField] = useState('');
    const [aggregation, setAggregation] = useState<ComputedAggregation>('unique');
    const [sourceFromField, setSourceFromField] = useState('');
    const [generator, setGenerator] = useState<GeneratorType>('uuid');

    // Attributes
    const [isSearchable, setIsSearchable] = useState(true);
    const [isFacetable, setIsFacetable] = useState(false);
    const [includeInResponse, setIncludeInResponse] = useState(true);
    const [isVectorSource, setIsVectorSource] = useState(false);
    const [isRequired, setIsRequired] = useState(false);
    const [isAutocomplete, setIsAutocomplete] = useState(false);
    const [boostValue, setBoostValue] = useState<number>(1.0);

    // Autocomplete is text-only (matches the edit panel and the Zod schema's refine).
    const isAutocompleteCompatible = fieldType === 'text';

    const [isSubmitting, setIsSubmitting] = useState(false);

    const existingNames = useMemo(
        () => new Set(existingFields.map((f) => f.fieldName)),
        [existingFields],
    );

    const reset = useCallback(() => {
        setFieldName('');
        setFieldType('keyword');
        setDisplayName('');
        setDisplayNameTouched(false);
        setMode('source');
        setSourceField('');
        setStaticValue('');
        setSourceArrayPath('');
        setExtractField('');
        setAggregation('unique');
        setSourceFromField('');
        setGenerator('uuid');
        setIsSearchable(true);
        setIsFacetable(false);
        setIncludeInResponse(true);
        setIsVectorSource(false);
        setIsRequired(false);
        setIsAutocomplete(false);
        setBoostValue(1.0);
        setIsSubmitting(false);
    }, []);

    // Auto-derive display name from field name until user types in the display-name input
    const onFieldNameChange = useCallback((value: string) => {
        setFieldName(value);
        if (!displayNameTouched) {
            setDisplayName(deriveDisplayName(value));
        }
    }, [displayNameTouched]);

    // Validation
    const validation = useMemo(() => {
        const errors: string[] = [];

        if (!fieldName) errors.push('Field name is required.');
        else if (!FIELD_NAME_PATTERN.test(fieldName)) errors.push('Field name must start with a letter and contain only letters, digits, and underscores.');
        else if (existingNames.has(fieldName)) errors.push(`"${fieldName}" already exists in this index.`);

        if (!fieldType) errors.push('Field type is required.');

        if (mode === 'static' && !staticValue.trim()) {
            errors.push('Static value is required for mode "static".');
        }
        if (mode === 'computed') {
            if (!sourceArrayPath.trim()) errors.push('Source array path is required for mode "computed".');
            if (!extractField.trim()) errors.push('Extract field is required for mode "computed".');
        }
        if (mode === 'reference' && !sourceFromField) {
            errors.push('Pick a field to reference for mode "reference".');
        }

        if (boostValue < 0.1 || boostValue > 100) errors.push('Boost must be between 0.1 and 100.');

        return errors;
    }, [fieldName, fieldType, mode, staticValue, sourceArrayPath, extractField, sourceFromField, boostValue, existingNames]);

    const canSubmit = validation.length === 0 && !isSubmitting;

    // Coerce static value to the field's type. Best-effort — server validates anyway.
    function coerceStaticValue(raw: string, type: FieldType): unknown {
        const trimmed = raw.trim();
        if (type === 'number') {
            const n = Number(trimmed);
            return Number.isFinite(n) ? n : trimmed;
        }
        if (type === 'boolean') {
            if (trimmed.toLowerCase() === 'true') return true;
            if (trimmed.toLowerCase() === 'false') return false;
            return trimmed;
        }
        return trimmed;
    }

    const handleSubmit = useCallback(async () => {
        if (!canSubmit) return;

        setIsSubmitting(true);
        try {
            const mappingConfig: Parameters<typeof searchIndexFieldsApi.createField>[1]['mappingConfig'] = {
                mode,
                transform: 'none',
            };

            if (mode === 'static') {
                mappingConfig.staticValue = coerceStaticValue(staticValue, fieldType);
            }
            if (mode === 'computed') {
                mappingConfig.computed = {
                    sourceArrayPath: sourceArrayPath.trim(),
                    extractField: extractField.trim(),
                    aggregation,
                };
            }
            if (mode === 'reference') {
                mappingConfig.sourceFromField = sourceFromField;
            }
            if (mode === 'generated') {
                mappingConfig.generator = generator;
            }

            // For source mode: default sourceFieldPath to the field name if blank
            const sourcePath =
                mode === 'source'
                    ? (sourceField.trim() || fieldName)
                    : null;

            const created = await searchIndexFieldsApi.createField(searchIndexId, {
                fieldName,
                fieldType,
                displayName: displayName || null,
                isSearchable,
                isFacetable,
                includeInResponse,
                boostValue,
                isVectorSource,
                isRequired,
                // Only send isAutocomplete when type-compatible — Zod refine
                // rejects the field otherwise.
                isAutocomplete: isAutocompleteCompatible ? isAutocomplete : undefined,
                sourceFieldPath: sourcePath,
                mappingConfig,
            });

            toast.success(`Created field "${created.fieldName}"`);
            onCreated(created);
            reset();
            onOpenChange(false);
        } catch (e) {
            const msg = (e as Error).message;
            toast.error('Failed to create field', { description: msg });
            setIsSubmitting(false);
        }
    }, [
        canSubmit, mode, fieldName, fieldType, displayName, sourceField, staticValue,
        sourceArrayPath, extractField, aggregation, sourceFromField, generator,
        isSearchable, isFacetable, includeInResponse, isVectorSource, isRequired,
        isAutocomplete, isAutocompleteCompatible, boostValue,
        searchIndexId, onCreated, onOpenChange, reset,
    ]);

    const handleClose = useCallback(() => {
        if (isSubmitting) return;
        reset();
        onOpenChange(false);
    }, [isSubmitting, reset, onOpenChange]);

    // Candidate fields for `reference` mode = existing mapped source-mode fields
    const referenceCandidates = useMemo(
        () => existingFields.filter((f) => !!f.sourceFieldName),
        [existingFields],
    );

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Plus className="h-5 w-5" />
                        Add field
                    </DialogTitle>
                    <DialogDescription>
                        Define one field. For bulk-add from data, use the bulk upload flow on this index. For bulk-add from JSON, use Import.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Identity */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="fieldName">Field name *</Label>
                            <Input
                                id="fieldName"
                                value={fieldName}
                                onChange={(e) => onFieldNameChange(e.target.value)}
                                placeholder="e.g. brand"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="fieldType">Field type *</Label>
                            <Select value={fieldType} onValueChange={(v) => setFieldType(v as FieldType)}>
                                <SelectTrigger id="fieldType">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {FIELD_TYPES.map((t) => (
                                        <SelectItem key={t} value={t}>
                                            <span className="font-medium">{FIELD_TYPE_INFO[t].label}</span>
                                            <span className="text-muted-foreground ml-2 text-xs">{t}</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="displayName">Display name</Label>
                        <Input
                            id="displayName"
                            value={displayName}
                            onChange={(e) => { setDisplayName(e.target.value); setDisplayNameTouched(true); }}
                            placeholder="Optional — auto-derived from field name"
                        />
                    </div>

                    {/* Mapping mode */}
                    <div className="space-y-1.5">
                        <Label htmlFor="mode">Mapping mode</Label>
                        <Select value={mode} onValueChange={(v) => setMode(v as MappingMode)}>
                            <SelectTrigger id="mode">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ALLOWED_MODES.map((m) => (
                                    <SelectItem key={m} value={m}>
                                        <span className="font-medium">{MAPPING_MODE_INFO[m].label}</span>
                                        <span className="text-muted-foreground ml-2 text-xs">{m}</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-muted-foreground text-xs">{MAPPING_MODE_INFO[mode].description}</p>
                    </div>

                    {/* Mode-specific inputs */}
                    {mode === 'source' && (
                        <div className="space-y-1.5">
                            <Label htmlFor="sourceField">Source field path</Label>
                            <Input
                                id="sourceField"
                                value={sourceField}
                                onChange={(e) => setSourceField(e.target.value)}
                                placeholder={fieldName ? `defaults to "${fieldName}"` : 'e.g. brand or nested.field'}
                            />
                            <p className="text-muted-foreground text-xs">
                                The key in the source document. Leave blank to use the field name.
                            </p>
                        </div>
                    )}

                    {mode === 'static' && (
                        <div className="space-y-1.5">
                            <Label htmlFor="staticValue">Static value *</Label>
                            <Input
                                id="staticValue"
                                value={staticValue}
                                onChange={(e) => setStaticValue(e.target.value)}
                                placeholder={
                                    fieldType === 'boolean' ? 'true or false' :
                                    fieldType === 'number' ? 'e.g. 42' :
                                    'e.g. USD'
                                }
                            />
                            <p className="text-muted-foreground text-xs">
                                Same value used for every document. Coerced based on field type.
                            </p>
                        </div>
                    )}

                    {mode === 'computed' && (
                        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="sourceArrayPath">Source array path *</Label>
                                    <Input
                                        id="sourceArrayPath"
                                        value={sourceArrayPath}
                                        onChange={(e) => setSourceArrayPath(e.target.value)}
                                        placeholder="e.g. variants"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="extractField">Extract field *</Label>
                                    <Input
                                        id="extractField"
                                        value={extractField}
                                        onChange={(e) => setExtractField(e.target.value)}
                                        placeholder="e.g. color"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="aggregation">Aggregation</Label>
                                <Select value={aggregation} onValueChange={(v) => setAggregation(v as ComputedAggregation)}>
                                    <SelectTrigger id="aggregation">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {COMPUTED_AGGREGATIONS.map((a) => (
                                            <SelectItem key={a} value={a}>{a}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <p className="text-muted-foreground text-xs">
                                e.g. extract <code>color</code> from each item in <code>variants[]</code>, aggregate as <code>unique</code> → available colors.
                            </p>
                        </div>
                    )}

                    {mode === 'reference' && (
                        <div className="space-y-1.5">
                            <Label htmlFor="sourceFromField">Reference field *</Label>
                            <Select value={sourceFromField} onValueChange={setSourceFromField}>
                                <SelectTrigger id="sourceFromField">
                                    <SelectValue placeholder={referenceCandidates.length > 0 ? 'Pick a mapped field' : 'No mapped source fields available'} />
                                </SelectTrigger>
                                <SelectContent>
                                    {referenceCandidates.map((f) => (
                                        <SelectItem key={f.id} value={f.sourceFieldName ?? f.fieldName}>
                                            {f.fieldName}
                                            <span className="text-muted-foreground ml-2 text-xs">← {f.sourceFieldName}</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-muted-foreground text-xs">
                                Use the same source value as another field (e.g. uniqueId ← productId).
                            </p>
                        </div>
                    )}

                    {mode === 'generated' && (
                        <div className="space-y-1.5">
                            <Label htmlFor="generator">Generator</Label>
                            <Select value={generator} onValueChange={(v) => setGenerator(v as GeneratorType)}>
                                <SelectTrigger id="generator">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {GENERATOR_TYPES.map((g) => (
                                        <SelectItem key={g} value={g}>{g}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Attributes */}
                    <div className="space-y-2 pt-2 border-t">
                        <Label className="text-sm font-medium">Attributes</Label>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                            <label className="flex items-center gap-2 text-sm">
                                <Checkbox checked={isSearchable} onCheckedChange={(c) => setIsSearchable(c === true)} />
                                Searchable
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <Checkbox checked={isFacetable} onCheckedChange={(c) => setIsFacetable(c === true)} />
                                Facetable
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <Checkbox checked={includeInResponse} onCheckedChange={(c) => setIncludeInResponse(c === true)} />
                                Include in response
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <Checkbox checked={isVectorSource} onCheckedChange={(c) => setIsVectorSource(c === true)} />
                                Vector source (for semantic search)
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <Checkbox checked={isRequired} onCheckedChange={(c) => setIsRequired(c === true)} />
                                Required
                            </label>
                            {isAutocompleteCompatible && (
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox checked={isAutocomplete} onCheckedChange={(c) => setIsAutocomplete(c === true)} />
                                    Autocomplete <span className="text-muted-foreground text-xs">(text only)</span>
                                </label>
                            )}
                            <div className="flex items-center gap-2 text-sm">
                                <Label htmlFor="boost" className="text-sm font-normal">Boost</Label>
                                <Input
                                    id="boost"
                                    type="number"
                                    min={0.1}
                                    max={100}
                                    step={0.1}
                                    value={boostValue}
                                    onChange={(e) => setBoostValue(parseFloat(e.target.value) || 1.0)}
                                    className="h-8 w-20"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Errors */}
                    {validation.length > 0 && fieldName !== '' && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                <p className="font-medium">Fix before saving</p>
                            </div>
                            <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs">
                                {validation.map((e, i) => <li key={i}>{e}</li>)}
                            </ul>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit}>
                        {isSubmitting ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                            <Plus className="h-4 w-4 mr-1" />
                        )}
                        {isSubmitting ? 'Creating…' : 'Create field'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
