// app/search-indexes/(pages)/[id]/mappings/page.tsx

'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
    ArrowLeft,
    RefreshCw,
    Layers,
    CheckCircle2,
    AlertCircle,
    Save,
    Loader2,
    RotateCcw,
    Wand2,
    Database,
    Download,
    Upload,
    FileJson,
    Table2,
    Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSearchIndex } from '../../../_lib/hooks/useSearchIndexes';
import {
    useSearchIndexFields,
    useFieldMappingSummary,
    useBulkUpdateMappings,
} from '../../../_lib/hooks/useSearchIndexFields';
import { searchIndexFieldsApi } from '../../../_lib/api-client';
import { FieldMappingTable, type FieldAttributeChange } from '../../../_components/FieldMappingTable';
import { FieldMappingSummary } from '../../../_components/FieldMappingSummary';
import { FieldMappingJsonEditor } from '../../../_components/FieldMappingJsonEditor';
import { FieldMappingJsonImportDialog } from '../../../_components/FieldMappingJsonImportDialog';
import { AddFieldDialog } from '../../../_components/AddFieldDialog';
import { JsonSourceInput } from '../../../_components/JsonSourceInput';
import { parseJsonForFields, isTypeCompatible } from '../../../_lib/utils/JsonFieldParser';
import { fieldsToJson } from '../../../_lib/utils/field-mappings-json';
import { ReindexDialog } from '../../../_components/ReindexDialog';
import {
    FieldInferenceReviewDialog,
    type InferredField,
    type ReviewedField,
} from '../../../_components/FieldInferenceReviewDialog';
import { PageHeaderSkeleton } from '@/shared/ui/custom/skeletons';
import {
    SEARCH_TYPE_INFO,
    type SearchType,
    type ParsedSourceField,
    type SearchIndexField,
    type FieldMappingConfig,
    getFieldMappingConfig,
} from '@/features/search-index';

// ============================================================================
// TYPES
// ============================================================================

interface FieldMapping {
    fieldId: number;
    sourceFieldPath: string | null;
    mappingConfig?: FieldMappingConfig;
    isAutoMapped?: boolean;
    isVectorSource?: boolean;
}

// ============================================================================
// SKELETON
// ============================================================================

function MappingsPageSkeleton() {
    return (
        <div className="p-6 space-y-6">
            <PageHeaderSkeleton showBreadcrumb={true} showDescription={true} actionsCount={2} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <Card key={i} className="border-slate-200">
                        <CardContent className="p-4">
                            <div className="h-4 w-20 bg-slate-200 rounded animate-pulse mb-2" />
                            <div className="h-8 w-12 bg-slate-200 rounded animate-pulse" />
                        </CardContent>
                    </Card>
                ))}
            </div>
            <Card className="border-slate-200">
                <CardContent className="p-6">
                    <div className="space-y-3">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// ============================================================================
// AUTO-MAPPING HELPER
// ============================================================================

function generateAutoMappings(
    fields: SearchIndexField[],
    sourceFields: ParsedSourceField[]
): FieldMapping[] {
    const mappings: FieldMapping[] = [];
    const usedSourceFields = new Set<string>();

    // Sort fields by priority: required first
    const sortedFields = [...fields].sort((a, b) => {
        if (a.isRequired && !b.isRequired) return -1;
        if (!a.isRequired && b.isRequired) return 1;
        return 0;
    });

    for (const field of sortedFields) {
        let bestMatch: ParsedSourceField | null = null;
        let bestScore = 0;

        for (const sourceField of sourceFields) {
            if (usedSourceFields.has(sourceField.path)) continue;

            let score = 0;
            const fieldNameLower = field.fieldName.toLowerCase();
            const sourcePathLower = sourceField.path.toLowerCase();
            const sourceNameLower = sourceField.name.toLowerCase();

            // Exact name match (highest priority)
            if (fieldNameLower === sourcePathLower || fieldNameLower === sourceNameLower) {
                score = 100;
            }
            // Field name contains source name or vice versa
            else if (fieldNameLower.includes(sourceNameLower) || sourceNameLower.includes(fieldNameLower)) {
                score = 70;
            }
            // Partial match (e.g., "productName" matches "name")
            else if (sourceNameLower.includes(fieldNameLower) || fieldNameLower.includes(sourceNameLower)) {
                score = 50;
            }

            // Boost score for type compatibility
            const compatibility = isTypeCompatible(sourceField.inferredType, field.fieldType);
            if (compatibility === 'exact') score += 20;
            else if (compatibility === 'compatible') score += 10;
            else if (compatibility === 'incompatible') score -= 30;

            if (score > bestScore) {
                bestScore = score;
                bestMatch = sourceField;
            }
        }

        // Get existing config from field
        const existingConfig = getFieldMappingConfig(field.transformConfig);

        // Only auto-map if we have a reasonable match (score >= 50)
        if (bestMatch && bestScore >= 50) {
            usedSourceFields.add(bestMatch.path);
            mappings.push({
                fieldId: field.id,
                sourceFieldPath: bestMatch.path,
                mappingConfig: { ...existingConfig, mode: 'source' },
                isAutoMapped: true,
            });
        } else {
            mappings.push({
                fieldId: field.id,
                sourceFieldPath: null,
                mappingConfig: existingConfig,
                isAutoMapped: false,
            });
        }
    }

    return mappings;
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function FieldMappingsPage() {
    const params = useParams();
    const router = useRouter();
    const indexId = params.id as string;

    // Source fields state
    const [sourceFields, setSourceFields] = useState<ParsedSourceField[]>([]);
    const [recordCount, setRecordCount] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);

    // Mapping state (local changes before save)
    const [localMappings, setLocalMappings] = useState<FieldMapping[]>([]);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [autoMappedCount, setAutoMappedCount] = useState(0);

    // Track if initial mappings have been set
    const initializedRef = useRef(false);

    // Field inference review dialog state
    const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
    const [inferredFields, setInferredFields] = useState<InferredField[]>([]);
    const [pendingSourceJson, setPendingSourceJson] = useState<unknown>(null);
    const [isCreatingFields, setIsCreatingFields] = useState(false);

    // Fetch search index
    const {
        searchIndex,
        isLoading: isLoadingIndex,
        isError: isIndexError,
        triggerReindex,
        isReindexing,
    } = useSearchIndex(indexId);

    // Fetch fields
    const {
        data: fields,
        isLoading: isLoadingFields,
        refetch: refetchFields,
    } = useSearchIndexFields(indexId);

    // Fetch summary
    const {
        data: summary,
        isLoading: isLoadingSummary,
        refetch: refetchSummary,
    } = useFieldMappingSummary(indexId);

    // Bulk update mutation
    const bulkUpdateMutation = useBulkUpdateMappings(indexId);

    // Track pending attribute changes (batched for save)
    const [pendingAttributeChanges, setPendingAttributeChanges] = useState<Map<number, FieldAttributeChange>>(new Map());

    // Track if reindex is needed (saved changes that require ES mapping update)
    const [reindexNeeded, setReindexNeeded] = useState(false);

    // Reindex dialog state
    const [reindexDialogOpen, setReindexDialogOpen] = useState(false);

    // View mode (visual table vs JSON editor)
    const [viewMode, setViewMode] = useState<'visual' | 'json'>('visual');

    // Import dialog state
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [addFieldDialogOpen, setAddFieldDialogOpen] = useState(false);

    // Tracks the entire save flow (bulk mappings + attribute updates)
    const [isSaving, setIsSaving] = useState(false);

    // Check if any pending changes require reindexing
    const hasReindexRequired = useMemo(() => {
        if (!fields) return false;
        for (const [fieldId, change] of pendingAttributeChanges) {
            const field = fields.find(f => f.id === fieldId);
            if (!field) continue;
            if (change.isSearchable !== undefined && change.isSearchable !== field.isSearchable) return true;
            if (change.isFacetable !== undefined && change.isFacetable !== field.isFacetable) return true;
            if (change.isAutocomplete !== undefined && change.isAutocomplete !== field.isAutocomplete) return true;
        }
        return false;
    }, [pendingAttributeChanges, fields]);

    // Handle attribute changes from the settings popover
    const handleAttributeChange = useCallback((change: FieldAttributeChange) => {
        setPendingAttributeChanges(prev => {
            const updated = new Map(prev);
            const existing = updated.get(change.fieldId) || { fieldId: change.fieldId };
            updated.set(change.fieldId, { ...existing, ...change });
            return updated;
        });
        setHasUnsavedChanges(true);
    }, []);

    // Initialize local mappings from server data (only once)
    useEffect(() => {
        if (fields && fields.length > 0 && !initializedRef.current) {
            const mappings = fields.map((field) => ({
                fieldId: field.id,
                sourceFieldPath: field.sourceFieldName,
                mappingConfig: getFieldMappingConfig(field.transformConfig),
                isAutoMapped: false,
                isVectorSource: field.isVectorSource ?? false,
            }));
            setLocalMappings(mappings);
            initializedRef.current = true;
        }
    }, [fields]);

    // ── Client-side type inference (mirrors server logic for preview) ──
    function inferFieldType(value: unknown): string {
        if (value === null || value === undefined) return 'keyword';
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number') return 'number';
        if (typeof value === 'string') {
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return 'datetime';
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
            if (/^https?:\/\//.test(value)) {
                if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|$)/i.test(value)) return 'image_url';
                return 'url';
            }
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
            return value.length > 100 ? 'text' : 'keyword';
        }
        if (Array.isArray(value)) {
            if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) return 'json';
            return 'array';
        }
        if (typeof value === 'object') return 'json';
        return 'keyword';
    }

    function generateDisplayName(fieldName: string): string {
        const last = fieldName.includes('.') ? fieldName.split('.').pop()! : fieldName;
        return last
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[_-]+/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    // Handle JSON parsed — parse source fields, then show review dialog if new fields needed
    const handleJsonParsed = useCallback((json: unknown, _source: 'paste' | 'upload') => {
        setIsProcessing(true);

        const result = parseJsonForFields(json);

        if (!result.success || result.fields.length === 0) {
            setSourceFields([]);
            setRecordCount(0);
            setIsProcessing(false);
            return;
        }

        setSourceFields(result.fields);
        setRecordCount(result.recordCount);
        setPendingSourceJson(json);

        // Check if the index needs new fields
        const existingNames = new Set((fields ?? []).map(f => f.fieldName));
        const customFieldCount = (fields ?? []).filter(f => !f.isSystemField).length;

        // Walk the JSON to build inferred field list
        const sampleObj = (Array.isArray(json) ? json[0] : json) as Record<string, unknown>;
        const inferred: InferredField[] = [];

        function walkObject(obj: Record<string, unknown>, prefix: string, depth: number) {
            for (const [key, value] of Object.entries(obj)) {
                const fieldName = prefix ? `${prefix}.${key}` : key;
                if (typeof value === 'object' && value !== null && !Array.isArray(value) && depth < 2) {
                    walkObject(value as Record<string, unknown>, fieldName, depth + 1);
                    continue;
                }
                inferred.push({
                    fieldName,
                    inferredType: inferFieldType(value),
                    displayName: generateDisplayName(fieldName),
                    sampleValue: value,
                    alreadyExists: existingNames.has(fieldName),
                    depth,
                });
            }
        }

        if (sampleObj && typeof sampleObj === 'object') {
            walkObject(sampleObj, '', 0);
        }

        const newFieldCount = inferred.filter(f => !f.alreadyExists).length;

        if (newFieldCount > 0 || customFieldCount === 0) {
            // Show review dialog for user to confirm types
            setInferredFields(inferred);
            setReviewDialogOpen(true);
            setIsProcessing(false);
        } else {
            // All fields already exist — just auto-map
            const currentFields = fields ?? [];
            if (currentFields.length > 0) {
                const autoMappings = generateAutoMappings(currentFields, result.fields);
                setLocalMappings(autoMappings);
                initializedRef.current = true;

                const mappedCount = autoMappings.filter(m => m.sourceFieldPath && m.isAutoMapped).length;
                setAutoMappedCount(mappedCount);
                setHasUnsavedChanges(mappedCount > 0);

                if (mappedCount > 0) {
                    toast.success(`Auto-mapped ${mappedCount} of ${currentFields.length} fields`, {
                        description: 'Review mappings and save when ready',
                    });
                }
            }
            setIsProcessing(false);
        }
    }, [fields]);

    // Handle review dialog confirm — create fields then auto-map
    const handleReviewConfirm = useCallback(async (reviewedFields: ReviewedField[]) => {
        setIsCreatingFields(true);
        try {
            const result = await searchIndexFieldsApi.createFieldsFromReview(
                indexId,
                reviewedFields.map(f => ({
                    fieldName: f.fieldName,
                    fieldType: f.fieldType,
                    displayName: f.displayName,
                }))
            );

            toast.success(`Created ${result.createdCount} fields`, {
                description: 'Fields created with your selected types',
            });

            // Refetch fields
            const freshFields = await refetchFields();
            const currentFields = freshFields.data ?? fields ?? [];
            initializedRef.current = false;

            // Auto-map
            if (currentFields.length > 0 && sourceFields.length > 0) {
                const autoMappings = generateAutoMappings(currentFields, sourceFields);
                setLocalMappings(autoMappings);
                initializedRef.current = true;

                const mappedCount = autoMappings.filter(m => m.sourceFieldPath && m.isAutoMapped).length;
                setAutoMappedCount(mappedCount);
                setHasUnsavedChanges(mappedCount > 0);

                if (mappedCount > 0) {
                    toast.success(`Auto-mapped ${mappedCount} of ${currentFields.length} fields`, {
                        description: 'Review mappings and save when ready',
                    });
                }
            }

            // Also refetch summary
            refetchSummary();

            setReviewDialogOpen(false);
        } catch (err) {
            console.error('Failed to create fields:', err);
            toast.error('Failed to create fields', {
                description: err instanceof Error ? err.message : 'Unknown error',
            });
        } finally {
            setIsCreatingFields(false);
        }
    }, [indexId, fields, sourceFields, refetchFields, refetchSummary]);

    // Handle clear source data
    const handleClearSource = useCallback(() => {
        setSourceFields([]);
        setRecordCount(0);
        setAutoMappedCount(0);

        // Reset mappings to server state
        if (fields) {
            const mappings = fields.map((field) => ({
                fieldId: field.id,
                sourceFieldPath: field.sourceFieldName,
                mappingConfig: getFieldMappingConfig(field.transformConfig),
                isAutoMapped: false,
                isVectorSource: field.isVectorSource ?? false,
            }));
            setLocalMappings(mappings);
            setHasUnsavedChanges(false);
        }
    }, [fields]);

    // Handle individual mapping change (user manually changed it)
    const handleMappingChange = useCallback((
        fieldId: number,
        sourceFieldPath: string | null,
        mappingConfig?: FieldMappingConfig,
        isVectorSource?: boolean
    ) => {
        setLocalMappings((prev) => {
            const updated = prev.map((m) =>
                m.fieldId === fieldId
                    ? {
                        ...m,
                        sourceFieldPath,
                        mappingConfig: mappingConfig || m.mappingConfig,
                        isAutoMapped: false,
                        // Only update isVectorSource if explicitly provided
                        ...(isVectorSource !== undefined && { isVectorSource }),
                    }
                    : m
            );
            return updated;
        });
        setHasUnsavedChanges(true);
    }, []);

    // Handle re-run auto-mapping
    const handleReAutoMap = useCallback(() => {
        if (!fields || sourceFields.length === 0) return;

        const autoMappings = generateAutoMappings(fields, sourceFields);
        setLocalMappings(autoMappings);
        
        const mappedCount = autoMappings.filter(m => m.sourceFieldPath && m.isAutoMapped).length;
        setAutoMappedCount(mappedCount);
        setHasUnsavedChanges(true);

        toast.success(`Auto-mapped ${mappedCount} of ${fields.length} fields`);
    }, [fields, sourceFields]);

    // Handle reset (discard changes)
    const handleReset = useCallback(() => {
        if (fields) {
            const mappings = fields.map((field) => ({
                fieldId: field.id,
                sourceFieldPath: field.sourceFieldName,
                mappingConfig: getFieldMappingConfig(field.transformConfig),
                isAutoMapped: false,
                isVectorSource: field.isVectorSource ?? false,
            }));
            setLocalMappings(mappings);
            setPendingAttributeChanges(new Map());
            setHasUnsavedChanges(false);
            setAutoMappedCount(0);
        }
        toast.info('Changes discarded');
    }, [fields]);

    // Handle JSON editor apply — pushes JSON edits back to shared state
    const handleJsonApply = useCallback((
        newMappings: FieldMapping[],
        newAttributeChanges: Map<number, FieldAttributeChange>,
    ) => {
        setLocalMappings(newMappings);
        setPendingAttributeChanges(prev => {
            const merged = new Map(prev);
            for (const [fieldId, change] of newAttributeChanges) {
                merged.set(fieldId, { ...(merged.get(fieldId) || { fieldId }), ...change });
            }
            return merged;
        });
        setHasUnsavedChanges(true);
    }, []);

    // Persist a set of mappings + attribute changes to the server. Shared
    // between the manual Save All button and the JSON import flow so import
    // changes hit the DB immediately — staging-without-saving had been
    // confusing users who exported right after Apply and saw stale data.
    const persistChanges = useCallback(async (
        mappingsToSave: FieldMapping[],
        attributeChangesToSave: Map<number, FieldAttributeChange>,
    ): Promise<boolean> => {
        await bulkUpdateMutation.mutateAsync({
            mappings: mappingsToSave.map((m) => ({
                fieldId: m.fieldId,
                sourceFieldName: m.sourceFieldPath,
                sourceFieldPath: m.sourceFieldPath,
                mappingConfig: m.mappingConfig,
                isVectorSource: m.isVectorSource,
            })),
        });

        if (attributeChangesToSave.size > 0) {
            const attributeUpdatePromises = Array.from(attributeChangesToSave.values()).map(change => {
                const updateData: Record<string, unknown> = {};
                if (change.isSearchable !== undefined) updateData.isSearchable = change.isSearchable;
                if (change.isFacetable !== undefined) updateData.isFacetable = change.isFacetable;
                if (change.includeInResponse !== undefined) updateData.includeInResponse = change.includeInResponse;
                if (change.boostValue !== undefined) updateData.boostValue = change.boostValue;
                if (change.isAutocomplete !== undefined) updateData.isAutocomplete = change.isAutocomplete;
                if (change.providerFieldSettings !== undefined) updateData.providerFieldSettings = change.providerFieldSettings;
                if (change.filterValueMappings !== undefined) updateData.filterValueMappings = change.filterValueMappings;

                return searchIndexFieldsApi.updateField(indexId, change.fieldId, updateData);
            });

            await Promise.all(attributeUpdatePromises);
        }

        const freshResult = await refetchFields();
        const freshFields = freshResult.data;

        if (freshFields && freshFields.length > 0) {
            setLocalMappings(freshFields.map((field) => ({
                fieldId: field.id,
                sourceFieldPath: field.sourceFieldName,
                mappingConfig: getFieldMappingConfig(field.transformConfig),
                isAutoMapped: false,
                isVectorSource: field.isVectorSource ?? false,
            })));
        }

        setPendingAttributeChanges(new Map());
        setHasUnsavedChanges(false);
        return true;
    }, [bulkUpdateMutation, indexId, refetchFields]);

    // Handle JSON import from import dialog — auto-saves the imported
    // mappings so the user doesn't have to click Save afterward. Apply ≡ Save.
    const handleImportJson = useCallback(async (
        newMappings: FieldMapping[],
        newAttributeChanges: Map<number, FieldAttributeChange>,
    ) => {
        setLocalMappings(newMappings);
        setPendingAttributeChanges(newAttributeChanges);
        setHasUnsavedChanges(true);
        setIsSaving(true);
        try {
            await persistChanges(newMappings, newAttributeChanges);
            setAutoMappedCount(0);
            if (hasReindexRequired) {
                setReindexNeeded(true);
                toast.success('Field mappings imported and saved. Reindex required.', {
                    description: 'Click the Reindex button to apply Elasticsearch mapping changes.',
                });
            } else {
                toast.success('Field mappings imported and saved');
            }
            refetchSummary();
        } catch (error) {
            console.error('Failed to save imported mappings:', error);
            toast.error('Import applied locally, but saving failed — click Save All to retry.');
        } finally {
            setIsSaving(false);
        }
    }, [persistChanges, hasReindexRequired, refetchSummary]);

    // Handle export JSON download
    const handleExportJson = useCallback(() => {
        if (!fields || !searchIndex) return;

        const json = fieldsToJson(fields, localMappings, pendingAttributeChanges, {
            name: searchIndex.name,
            searchProvider: searchIndex.searchProvider,
        });
        json._exportedAt = new Date().toISOString();

        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `field-mappings-${searchIndex.name}-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        toast.success('Field mappings exported');
    }, [fields, localMappings, pendingAttributeChanges, searchIndex]);

    // Handle save
    const handleSave = useCallback(async () => {
        setIsSaving(true);
        try {
            await persistChanges(localMappings, pendingAttributeChanges);
            setAutoMappedCount(0);

            if (hasReindexRequired) {
                setReindexNeeded(true);
                toast.success('Changes saved. Reindexing required.', {
                    description: 'Click the Reindex button to apply Elasticsearch mapping changes.',
                });
            } else {
                toast.success('Changes saved successfully');
            }

            refetchSummary();
        } catch (error) {
            console.error('Failed to save mappings:', error);
            toast.error('Failed to save changes');
        } finally {
            setIsSaving(false);
        }
    }, [persistChanges, localMappings, pendingAttributeChanges, hasReindexRequired, refetchSummary]);

    // Calculate local summary
    const localSummary = useMemo(() => {
        if (!fields) return null;

        // Helper to check if a mapping config represents a "configured" field
        const isMappingConfigured = (m: FieldMapping): boolean => {
            if (m.sourceFieldPath) return true;
            if (m.mappingConfig?.mode === 'static' && m.mappingConfig.staticValue !== undefined) return true;
            if (m.mappingConfig?.mode === 'generated' && m.mappingConfig.generator) return true;
            if (m.mappingConfig?.mode === 'default' && (m.sourceFieldPath || m.mappingConfig.staticValue !== undefined || m.mappingConfig.generator)) return true;
            if (m.mappingConfig?.mode === 'collect') return true;
            if (m.mappingConfig?.mode === 'computed' && m.mappingConfig.computed?.sourceArrayPath && m.mappingConfig.computed?.extractField && m.mappingConfig.computed?.aggregation) return true;
            if (m.mappingConfig?.mode === 'reference' && m.mappingConfig.sourceFromField) return true;
            return false;
        };

        const mappedCount = localMappings.filter(isMappingConfigured).length;

        const requiredFields = fields.filter((f) => f.isRequired);
        const requiredMappedCount = requiredFields.filter((f) => {
            const mapping = localMappings.find((m) => m.fieldId === f.id);
            if (!mapping) return false;
            return isMappingConfigured(mapping);
        }).length;

        // Count by mapping mode
        let staticValueFields = 0;
        let generatedFields = 0;
        let computedFields = 0;
        let additionalDataFields: string[] = [];

        localMappings.forEach((m) => {
            if (m.mappingConfig?.mode === 'static') staticValueFields++;
            if (m.mappingConfig?.mode === 'generated') generatedFields++;
            if (m.mappingConfig?.mode === 'computed') computedFields++;
            if (m.mappingConfig?.mode === 'collect' && m.mappingConfig.collectFields) {
                additionalDataFields = m.mappingConfig.collectFields;
            }
        });

        return {
            totalFields: fields.length,
            mappedFields: mappedCount,
            unmappedFields: fields.length - mappedCount,
            requiredFields: requiredFields.length,
            requiredMappedFields: requiredMappedCount,
            isReadyForIndexing: requiredMappedCount === requiredFields.length,
            staticValueFields,
            generatedFields,
            computedFields,
            additionalDataFields,
        };
    }, [fields, localMappings]);

    // Can save only if all required fields are mapped
    const canSave = localSummary?.isReadyForIndexing ?? false;

    // Loading state
    if (isLoadingIndex) {
        return <MappingsPageSkeleton />;
    }

    // Error state
    if (isIndexError || !searchIndex) {
        return (
            <div className="p-6">
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="h-5 w-5 text-red-600" />
                            <div>
                                <p className="font-medium text-red-800">Failed to load search index</p>
                                <p className="text-sm text-red-600">
                                    The search index could not be found or there was an error loading it.
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            className="mt-4"
                            onClick={() => router.push('/search-indexes')}
                        >
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Indexes
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const searchTypeInfo = SEARCH_TYPE_INFO[searchIndex.searchType as SearchType];
    const hasSourceData = sourceFields.length > 0;

    // Determine if vector search is enabled (semantic or hybrid search types)
    const isVectorSearchEnabled = ['semantic', 'hybrid'].includes(searchIndex.searchType);

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4">
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <button
                        onClick={() => router.push('/search-indexes')}
                        className="hover:text-slate-700 transition-colors"
                    >
                        Search Indexes
                    </button>
                    <span>/</span>
                    <button
                        onClick={() => router.push(`/search-indexes/${indexId}`)}
                        className="hover:text-slate-700 transition-colors"
                    >
                        {searchIndex.displayName}
                    </button>
                    <span>/</span>
                    <span className="text-slate-900 font-medium">Fields</span>
                </div>

                {/* Title Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/search-indexes/${indexId}`)}
                            className="h-8 w-8 p-0"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold text-slate-900">
                                    Fields
                                </h1>
                                <Badge variant="outline" className="text-xs">
                                    {searchTypeInfo?.label || searchIndex.searchType}
                                </Badge>
                                {hasUnsavedChanges && (
                                    <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                                        Unsaved changes
                                    </Badge>
                                )}
                                {reindexNeeded && !hasUnsavedChanges && (
                                    <Badge className="bg-orange-100 text-orange-700 border-orange-200">
                                        <Database className="h-3 w-3 mr-1" />
                                        Reindex needed
                                    </Badge>
                                )}
                            </div>
                            <p className="text-slate-500 mt-1">
                                Map source data fields to index fields for{' '}
                                <span className="font-medium text-slate-700">
                                    {searchIndex.displayName}
                                </span>
                            </p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        {reindexNeeded && (
                            <Button
                                variant="default"
                                size="sm"
                                onClick={() => setReindexDialogOpen(true)}
                                disabled={isReindexing}
                                className="bg-orange-600 hover:bg-orange-700"
                            >
                                {isReindexing ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Reindexing...
                                    </>
                                ) : (
                                    <>
                                        <Database className="h-4 w-4 mr-2" />
                                        Reindex Now
                                    </>
                                )}
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refetchFields()}
                            disabled={isLoadingFields}
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingFields ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                </div>
            </div>

            {/* Stats + Source Data — compact side-by-side row */}
            <div className="flex gap-4 items-stretch">
                <div className="flex-1 min-w-0">
                    <FieldMappingSummary
                        compact
                        summary={hasUnsavedChanges && localSummary ? {
                            searchIndexId: indexId,
                            ...localSummary,
                            systemFields: summary?.systemFields ?? 0,
                            customFields: summary?.customFields ?? 0,
                        } : summary ?? null}
                        isLoading={isLoadingSummary && !hasUnsavedChanges}
                    />
                </div>
                <div className="w-80 shrink-0">
                    <JsonSourceInput
                        onJsonParsed={handleJsonParsed}
                        onClear={handleClearSource}
                        isProcessing={isProcessing}
                        sourceFieldCount={sourceFields.length}
                        recordCount={recordCount}
                    />
                </div>
            </div>

            {/* Fields Table / JSON Editor */}
            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-slate-900">
                                <Layers className="h-5 w-5" />
                                Index Fields
                            </CardTitle>
                            <CardDescription>
                                {fields?.length ?? 0} fields
                                {hasSourceData && viewMode === 'visual' && ` • ${sourceFields.length} source fields available`}
                                {autoMappedCount > 0 && viewMode === 'visual' && (
                                    <span className="text-blue-600 ml-1">
                                        • {autoMappedCount} auto-mapped
                                    </span>
                                )}
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* View mode toggle */}
                            <ToggleGroup
                                type="single"
                                value={viewMode}
                                onValueChange={(value) => {
                                    if (value) setViewMode(value as 'visual' | 'json');
                                }}
                                size="sm"
                            >
                                <ToggleGroupItem value="visual" aria-label="Visual table view">
                                    <Table2 className="h-4 w-4 mr-1" />
                                    Visual
                                </ToggleGroupItem>
                                <ToggleGroupItem value="json" aria-label="JSON editor view">
                                    <FileJson className="h-4 w-4 mr-1" />
                                    JSON
                                </ToggleGroupItem>
                            </ToggleGroup>

                            <div className="w-px h-5 bg-slate-200" />

                            {/* Export / Import */}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleExportJson}
                                disabled={!fields || fields.length === 0}
                            >
                                <Download className="h-4 w-4 mr-1" />
                                Export
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setImportDialogOpen(true)}
                            >
                                <Upload className="h-4 w-4 mr-1" />
                                Import
                            </Button>
                            <Button
                                variant="default"
                                size="sm"
                                onClick={() => setAddFieldDialogOpen(true)}
                            >
                                <Plus className="h-4 w-4 mr-1" />
                                Add field
                            </Button>

                            {viewMode === 'visual' && hasSourceData && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleReAutoMap}
                                >
                                    <Wand2 className="h-4 w-4 mr-1" />
                                    Re-map
                                </Button>
                            )}
                            {localSummary?.isReadyForIndexing && (
                                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Ready
                                </Badge>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {viewMode === 'visual' ? (
                        <FieldMappingTable
                            fields={fields ?? []}
                            sourceFields={sourceFields}
                            mappings={localMappings}
                            onMappingChange={handleMappingChange}
                            onAttributeChange={handleAttributeChange}
                            isLoading={isLoadingFields}
                            hasSourceData={hasSourceData}
                            isVectorSearchEnabled={isVectorSearchEnabled}
                            searchProvider={searchIndex?.searchProvider}
                        />
                    ) : (
                        <FieldMappingJsonEditor
                            fields={fields ?? []}
                            localMappings={localMappings}
                            pendingAttributeChanges={pendingAttributeChanges}
                            searchIndex={{
                                name: searchIndex.name,
                                searchProvider: searchIndex.searchProvider,
                            }}
                            onApply={handleJsonApply}
                            isLoading={isLoadingFields}
                        />
                    )}
                </CardContent>
            </Card>

            {/* Action Bar - Fixed at bottom when there are changes */}
            {hasUnsavedChanges && (
                <div className="sticky bottom-4 z-10">
                    <Card className={cn(
                        "shadow-lg",
                        hasReindexRequired ? "border-amber-300 bg-amber-50/50" : "border-slate-300"
                    )}>
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {!canSave && (
                                        <div className="flex items-center gap-2 text-sm text-amber-600">
                                            <AlertCircle className="h-4 w-4" />
                                            <span>
                                                {localSummary && localSummary.requiredFields - localSummary.requiredMappedFields} required field(s) not mapped
                                            </span>
                                        </div>
                                    )}
                                    {canSave && !hasReindexRequired && (
                                        <div className="flex items-center gap-2 text-sm text-emerald-600">
                                            <CheckCircle2 className="h-4 w-4" />
                                            <span>All required fields mapped</span>
                                        </div>
                                    )}
                                    {canSave && hasReindexRequired && (
                                        <div className="flex items-center gap-2 text-sm text-amber-600">
                                            <AlertCircle className="h-4 w-4" />
                                            <span>Changes require reindexing after save</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleReset}
                                    >
                                        <RotateCcw className="h-4 w-4 mr-1" />
                                        Discard
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleSave}
                                        disabled={!canSave || isSaving}
                                    >
                                        {isSaving ? (
                                            <>
                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="h-4 w-4 mr-2" />
                                                Save Mappings
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Reindex Dialog */}
            <ReindexDialog
                open={reindexDialogOpen}
                onOpenChange={setReindexDialogOpen}
                indexName={searchIndex.name}
                currentDocumentCount={searchIndex.documentCount ?? 0}
                onReindex={async () => {
                    const result = await triggerReindex();
                    return {
                        documentCount: result.documentCount,
                        durationMs: result.durationMs,
                    };
                }}
                onSuccess={() => {
                    setReindexNeeded(false);
                }}
            />

            {/* Import JSON Dialog */}
            <FieldMappingJsonImportDialog
                open={importDialogOpen}
                onOpenChange={setImportDialogOpen}
                fields={fields ?? []}
                localMappings={localMappings}
                onImport={handleImportJson}
                searchIndexId={indexId}
                refetchFields={async () => (await refetchFields()).data ?? []}
            />

            {/* Add Field Dialog */}
            <AddFieldDialog
                open={addFieldDialogOpen}
                onOpenChange={setAddFieldDialogOpen}
                searchIndexId={indexId}
                existingFields={fields ?? []}
                onCreated={() => {
                    refetchFields();
                    refetchSummary();
                }}
            />

            {/* Field Inference Review Dialog */}
            <FieldInferenceReviewDialog
                open={reviewDialogOpen}
                onOpenChange={setReviewDialogOpen}
                inferredFields={inferredFields}
                onConfirm={handleReviewConfirm}
                isCreating={isCreatingFields}
            />
        </div>
    );
}