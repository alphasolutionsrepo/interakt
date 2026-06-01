// app/search-indexes/_components/FieldMappingTable.tsx

/**
 * Field Mapping Table Component
 *
 * Displays index fields in a table.  Each row shows a read-only summary of the
 * field's mapping (mode + source) and attribute state (searchable/facetable/
 * autocomplete indicators).  A single "Configure" button per row opens the
 * unified FieldConfigSheet panel for editing.
 */

'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    CheckCircle2,
    XCircle,
    AlertCircle,
    Circle,
    Search,
    Filter,
    Lock,
    Settings2,
    Link2,
    Type,
    Hash,
    Zap,
    FileJson,
    Calculator,
    Brain,
    Sparkles,
} from 'lucide-react';
import { FieldConfigSheet } from './FieldConfigSheet';
import { cn } from '@/lib/utils';
import type {
    SearchIndexField,
    ParsedSourceField,
    FieldMappingConfig,
    MappingMode,
} from '@/features/search-index';
import {
    VALUE_TRANSFORM_INFO,
    getFieldMappingConfig,
} from '@/features/search-index';

// ============================================================================
// TYPES
// ============================================================================

export interface FieldMapping {
    fieldId: number;
    sourceFieldPath: string | null;
    mappingConfig?: FieldMappingConfig;
    isAutoMapped?: boolean;
    isVectorSource?: boolean;
}

/** Field attribute changes that may require reindexing */
export interface FieldAttributeChange {
    fieldId: number;
    isSearchable?: boolean;
    isFacetable?: boolean;
    includeInResponse?: boolean;
    boostValue?: number;
    isAutocomplete?: boolean;
    /** Provider-specific field settings (e.g. Azure isSortable) */
    providerFieldSettings?: Record<string, unknown>;
    /** Filter value mappings for facetable fields (canonical -> aliases) */
    filterValueMappings?: Record<string, string[]>;
}

interface FieldMappingTableProps {
    fields: SearchIndexField[];
    sourceFields: ParsedSourceField[];
    mappings: FieldMapping[];
    onMappingChange: (
        fieldId: number,
        sourceFieldPath: string | null,
        mappingConfig?: FieldMappingConfig,
        isVectorSource?: boolean
    ) => void;
    /** Callback for field attribute changes */
    onAttributeChange?: (change: FieldAttributeChange) => void;
    isLoading?: boolean;
    hasSourceData: boolean;
    readOnly?: boolean;
    /** Whether this index supports vector/embedding search */
    isVectorSearchEnabled?: boolean;
    /** Search provider for this index */
    searchProvider?: string;
}

// ============================================================================
// HELPER FUNCTIONS
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
        object: 'bg-cyan-50 text-cyan-700 border-cyan-200',
        vector: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    };
    return colors[fieldType.toLowerCase()] || 'bg-slate-50 text-slate-600 border-slate-200';
}

function getFieldMappingStatus(
    field: SearchIndexField,
    config: FieldMappingConfig,
    hasSourceMapping: boolean
): 'mapped' | 'configured' | 'required-unmapped' | 'optional-unmapped' | 'skipped' {
    const mode = config.mode;

    if (mode === 'none') return 'skipped';
    if (mode === 'static' && config.staticValue !== undefined) return 'configured';
    if (mode === 'generated' && config.generator) return 'configured';
    if (mode === 'collect') return 'configured';
    if (mode === 'reference' && config.sourceFromField) return 'configured';
    if (mode === 'computed' && config.computed?.sourceArrayPath && config.computed?.extractField)
        return 'configured';
    if (hasSourceMapping) return 'mapped';
    if (mode === 'default' && (config.staticValue !== undefined || config.generator)) return 'configured';
    return field.isRequired ? 'required-unmapped' : 'optional-unmapped';
}

function getValueDisplayText(
    _field: SearchIndexField,
    config: FieldMappingConfig,
    sourceFieldPath: string | null
): {
    text: string;
    type:
        | 'source'
        | 'static'
        | 'generated'
        | 'computed'
        | 'collect'
        | 'reference'
        | 'none'
        | 'fallback';
} {
    const mode = config.mode;

    if (mode === 'none') return { text: 'Not indexed', type: 'none' };

    if (mode === 'static') {
        const value = config.staticValue;
        if (value === undefined || value === null) return { text: 'No value set', type: 'static' };
        const displayValue = typeof value === 'string' ? `"${value}"` : String(value);
        return {
            text: displayValue.length > 30 ? displayValue.slice(0, 30) + '...' : displayValue,
            type: 'static',
        };
    }

    if (mode === 'generated') {
        const generator = config.generator || 'uuid';
        const labels: Record<string, string> = {
            uuid: 'Auto-generate UUID',
            timestamp: 'Auto-generate timestamp',
            current_date: 'Auto-generate date',
        };
        return { text: labels[generator] || generator, type: 'generated' };
    }

    if (mode === 'computed') {
        const computed = config.computed;
        if (!computed || !computed.sourceArrayPath || !computed.extractField) {
            return { text: 'Configure computed...', type: 'computed' };
        }
        return {
            text: `${computed.sourceArrayPath}.${computed.extractField}`,
            type: 'computed',
        };
    }

    if (mode === 'collect') {
        const count = config.collectFields?.length || 0;
        return {
            text: count > 0 ? `Collect ${count} fields` : 'Collect unmapped fields',
            type: 'collect',
        };
    }

    if (mode === 'reference') {
        const refField = config.sourceFromField;
        if (!refField) return { text: 'Select field...', type: 'reference' };
        return { text: `Copy from: ${refField}`, type: 'reference' };
    }

    if (sourceFieldPath) return { text: sourceFieldPath, type: 'source' };

    if (mode === 'default') {
        if (config.staticValue !== undefined) {
            const value = config.staticValue;
            const displayValue = typeof value === 'string' ? `"${value}"` : String(value);
            return {
                text: `Fallback: ${displayValue.length > 20 ? displayValue.slice(0, 20) + '...' : displayValue}`,
                type: 'fallback',
            };
        }
        if (config.generator) {
            const labels: Record<string, string> = {
                uuid: 'Fallback: UUID',
                timestamp: 'Fallback: timestamp',
                current_date: 'Fallback: date',
            };
            return { text: labels[config.generator] || config.generator, type: 'generated' };
        }
    }

    return { text: '—', type: 'none' };
}

// ── Value display constants (module-level so row rendering can use them) ──
const ICON_MAP: Record<string, React.ReactNode> = {
    source: <Link2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />,
    static: <Type className="h-3.5 w-3.5 text-purple-600 shrink-0" />,
    generated: <Zap className="h-3.5 w-3.5 text-amber-600 shrink-0" />,
    computed: <Calculator className="h-3.5 w-3.5 text-blue-600 shrink-0" />,
    collect: <FileJson className="h-3.5 w-3.5 text-cyan-600 shrink-0" />,
    reference: <Link2 className="h-3.5 w-3.5 text-indigo-600 shrink-0" />,
    fallback: <Hash className="h-3.5 w-3.5 text-slate-500 shrink-0" />,
    none: <XCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" />,
};

const BG_MAP: Record<string, string> = {
    source: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    static: 'bg-purple-50 border-purple-200 text-purple-800',
    generated: 'bg-amber-50 border-amber-200 text-amber-800',
    computed: 'bg-blue-50 border-blue-200 text-blue-800',
    collect: 'bg-cyan-50 border-cyan-200 text-cyan-800',
    reference: 'bg-indigo-50 border-indigo-200 text-indigo-800',
    fallback: 'bg-slate-100 border-slate-300 text-slate-700',
    none: 'bg-slate-50 border-slate-200 text-slate-400',
};

const MODE_LABELS: Record<MappingMode, string> = {
    source: 'Source',
    static: 'Static',
    generated: 'Auto',
    default: 'Default',
    computed: 'Computed',
    collect: 'Collect',
    reference: 'Copy From',
    none: 'Skip',
};

// ============================================================================
// STATUS INDICATOR
// ============================================================================

function StatusIndicator({
    status,
}: {
    status: 'mapped' | 'configured' | 'required-unmapped' | 'optional-unmapped' | 'skipped';
}) {
    switch (status) {
        case 'mapped':
            return (
                <div className="flex items-center gap-1.5 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-xs font-medium">Mapped</span>
                </div>
            );
        case 'configured':
            return (
                <div className="flex items-center gap-1.5 text-blue-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-xs font-medium">Configured</span>
                </div>
            );
        case 'required-unmapped':
            return (
                <div className="flex items-center gap-1.5 text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-xs font-medium">Required</span>
                </div>
            );
        case 'optional-unmapped':
            return (
                <div className="flex items-center gap-1.5 text-slate-400">
                    <Circle className="h-4 w-4" />
                    <span className="text-xs font-medium">Optional</span>
                </div>
            );
        case 'skipped':
            return (
                <div className="flex items-center gap-1.5 text-slate-400">
                    <XCircle className="h-4 w-4" />
                    <span className="text-xs font-medium">Skipped</span>
                </div>
            );
    }
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function LoadingSkeleton() {
    return (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="animate-pulse">
                <div className="h-12 bg-slate-100" />
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4 p-4 border-t border-slate-100">
                        <div className="h-4 bg-slate-200 rounded w-32" />
                        <div className="h-6 bg-slate-200 rounded w-16" />
                        <div className="h-8 bg-slate-200 rounded flex-1 max-w-[280px]" />
                        <div className="h-4 bg-slate-200 rounded w-20" />
                        <div className="h-6 bg-slate-200 rounded w-16" />
                    </div>
                ))}
            </div>
        </div>
    );
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function EmptyState() {
    return (
        <div className="border border-slate-200 rounded-lg p-8 text-center">
            <div className="text-slate-400 mb-2">
                <Filter className="h-12 w-12 mx-auto opacity-50" />
            </div>
            <h3 className="font-medium text-slate-700 mb-1">No fields defined</h3>
            <p className="text-sm text-slate-500">
                This index doesn&apos;t have any fields configured yet.
            </p>
        </div>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FieldMappingTable({
    fields,
    sourceFields,
    mappings,
    onMappingChange,
    onAttributeChange,
    isLoading,
    hasSourceData,
    readOnly = false,
    isVectorSearchEnabled = false,
    searchProvider,
}: FieldMappingTableProps) {
    // ── Sheet state ──
    const [sheetField, setSheetField] = useState<SearchIndexField | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);

    // ── Pending attribute overrides for optimistic indicator dots ──
    const [pendingAttributes, setPendingAttributes] = useState<
        Map<number, Partial<FieldAttributeChange>>
    >(new Map());

    const openSheet = (field: SearchIndexField) => {
        setSheetField(field);
        setSheetOpen(true);
    };

    // Intercept attribute changes: update local indicator dots + forward to page
    const handleAttributeChangeInternal = (change: FieldAttributeChange) => {
        setPendingAttributes((prev) => {
            const next = new Map(prev);
            const existing = next.get(change.fieldId) ?? {};
            next.set(change.fieldId, { ...existing, ...change });
            return next;
        });
        onAttributeChange?.(change);
    };

    // ── Lookup maps ──
    const mappingsByFieldId = useMemo(() => {
        const map = new Map<number, FieldMapping>();
        mappings.forEach((m) => map.set(m.fieldId, m));
        return map;
    }, [mappings]);

    const usedSourceFields = useMemo(() => {
        const used = new Set<string>();
        mappings.forEach((m) => {
            if (m.sourceFieldPath) used.add(m.sourceFieldPath);
        });
        fields.forEach((f) => {
            if (f.sourceFieldName) used.add(f.sourceFieldName);
        });
        return used;
    }, [mappings, fields]);

    if (isLoading) return <LoadingSkeleton />;
    if (!fields || fields.length === 0) return <EmptyState />;

    // ── Sort: required-unmapped first, then required, then system, then alpha ──
    const sortedFields = [...fields].sort((a, b) => {
        const aStatus = getFieldMappingStatus(
            a,
            getFieldMappingConfig(a.transformConfig),
            !!a.sourceFieldName || !!mappingsByFieldId.get(a.id)?.sourceFieldPath
        );
        const bStatus = getFieldMappingStatus(
            b,
            getFieldMappingConfig(b.transformConfig),
            !!b.sourceFieldName || !!mappingsByFieldId.get(b.id)?.sourceFieldPath
        );

        if (aStatus === 'required-unmapped' && bStatus !== 'required-unmapped') return -1;
        if (bStatus === 'required-unmapped' && aStatus !== 'required-unmapped') return 1;
        if (a.isRequired && !b.isRequired) return -1;
        if (!a.isRequired && b.isRequired) return 1;
        if (a.isSystemField && !b.isSystemField) return -1;
        if (!a.isSystemField && b.isSystemField) return 1;
        return a.fieldName.localeCompare(b.fieldName);
    });

    // ── Derive Sheet props from the currently selected field ──
    const sheetMapping = sheetField ? mappingsByFieldId.get(sheetField.id) : undefined;
    const sheetSourcePath = sheetMapping?.sourceFieldPath ?? sheetField?.sourceFieldName ?? null;
    const sheetConfig: FieldMappingConfig =
        sheetMapping?.mappingConfig ||
        (sheetField
            ? getFieldMappingConfig(sheetField.transformConfig)
            : { mode: 'source', transform: 'none' });

    return (
        <>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                            <TableHead className="font-semibold text-slate-700 w-[180px]">
                                Index Field
                            </TableHead>
                            <TableHead className="font-semibold text-slate-700 w-20">
                                Type
                            </TableHead>
                            <TableHead className="font-semibold text-slate-700 min-w-[280px]">
                                Value / Source
                            </TableHead>
                            <TableHead className="font-semibold text-slate-700 w-[110px]">
                                Status
                            </TableHead>
                            <TableHead className="font-semibold text-slate-700 w-[120px] text-center">
                                Attributes
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedFields.map((field) => {
                            const mapping = mappingsByFieldId.get(field.id);
                            const selectedSourcePath =
                                mapping?.sourceFieldPath ?? field.sourceFieldName ?? null;
                            const config: FieldMappingConfig =
                                mapping?.mappingConfig ||
                                getFieldMappingConfig(field.transformConfig);
                            const hasSourceMapping = !!selectedSourcePath;
                            const status = getFieldMappingStatus(field, config, hasSourceMapping);

                            const { text, type } = getValueDisplayText(
                                field,
                                config,
                                selectedSourcePath
                            );
                            const hasTransform = config.transform && config.transform !== 'none';

                            // Attribute indicator dots (use pending overrides for optimistic UI)
                            const pending = pendingAttributes.get(field.id);
                            const effectiveSearchable =
                                pending?.isSearchable ?? field.isSearchable;
                            const effectiveFacetable =
                                pending?.isFacetable ?? field.isFacetable;
                            const effectiveAutocomplete =
                                pending?.isAutocomplete ?? field.isAutocomplete;

                            return (
                                <TableRow
                                    key={field.id}
                                    className={cn(
                                        'transition-colors',
                                        status === 'required-unmapped' && 'bg-red-50/30',
                                        status === 'skipped' && 'opacity-50'
                                    )}
                                >
                                    {/* Field Name */}
                                    <TableCell className="py-3">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-slate-900 text-sm">
                                                {field.displayName || field.fieldName}
                                            </span>
                                            {field.displayName &&
                                                field.displayName !== field.fieldName && (
                                                    <span className="text-xs text-slate-500 font-mono">
                                                        {field.fieldName}
                                                    </span>
                                                )}
                                        </div>
                                    </TableCell>

                                    {/* Field Type */}
                                    <TableCell className="py-3">
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                'font-mono text-[10px] px-2',
                                                getFieldTypeBadgeColor(field.fieldType)
                                            )}
                                        >
                                            {field.fieldType}
                                        </Badge>
                                    </TableCell>

                                    {/* Value / Source — read-only summary, click to configure */}
                                    <TableCell className="py-3">
                                        <button
                                            className={cn(
                                                'flex items-center gap-2 rounded-md px-1 py-0.5 -mx-1 transition-colors text-left w-full',
                                                readOnly
                                                    ? 'cursor-default'
                                                    : 'hover:bg-slate-50 cursor-pointer'
                                            )}
                                            onClick={() =>
                                                !readOnly &&
                                                openSheet(field)
                                            }
                                            disabled={readOnly}
                                        >
                                            {/* Mode badge */}
                                            <Badge
                                                variant="outline"
                                                className="text-[10px] px-1.5 py-0.5 font-medium bg-slate-100 text-slate-600 border-slate-200 shrink-0"
                                            >
                                                {MODE_LABELS[config.mode]}
                                            </Badge>

                                            {/* Value pill */}
                                            <div
                                                className={cn(
                                                    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-sm',
                                                    type === 'source' ? 'font-mono' : '',
                                                    BG_MAP[type]
                                                )}
                                            >
                                                {ICON_MAP[type]}
                                                <span className="truncate max-w-40">
                                                    {text}
                                                </span>
                                            </div>

                                            {/* Transform badge */}
                                            {hasTransform && (
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] px-1.5 py-0.5 bg-orange-50 text-orange-700 border-orange-200 shrink-0"
                                                >
                                                    {VALUE_TRANSFORM_INFO[config.transform!]
                                                        ?.label || config.transform}
                                                </Badge>
                                            )}

                                            {/* Vector source indicator */}
                                            {mapping?.isVectorSource && (
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border-indigo-200 shrink-0"
                                                >
                                                    <Brain className="h-3 w-3 mr-0.5" />
                                                    Embed
                                                </Badge>
                                            )}
                                        </button>
                                    </TableCell>

                                    {/* Status */}
                                    <TableCell className="py-3">
                                        <StatusIndicator status={status} />
                                    </TableCell>

                                    {/* Attributes — indicator dots + configure button */}
                                    <TableCell className="py-3">
                                        <div className="flex items-center justify-center gap-1">
                                            <TooltipProvider>
                                                {field.isRequired && (
                                                    <Tooltip>
                                                        <TooltipTrigger>
                                                            <div className="p-1 rounded bg-red-50 text-red-600">
                                                                <AlertCircle className="h-3.5 w-3.5" />
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            <p className="text-xs">Required field</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                )}
                                                {field.isSystemField && (
                                                    <Tooltip>
                                                        <TooltipTrigger>
                                                            <div className="p-1 rounded bg-slate-100 text-slate-600">
                                                                <Lock className="h-3.5 w-3.5" />
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            <p className="text-xs">System field</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                )}
                                                {effectiveSearchable && (
                                                    <Tooltip>
                                                        <TooltipTrigger>
                                                            <div className="p-1 rounded bg-blue-50 text-blue-600">
                                                                <Search className="h-3.5 w-3.5" />
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            <p className="text-xs">Searchable</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                )}
                                                {effectiveFacetable && (
                                                    <Tooltip>
                                                        <TooltipTrigger>
                                                            <div className="p-1 rounded bg-violet-50 text-violet-600">
                                                                <Filter className="h-3.5 w-3.5" />
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            <p className="text-xs">Facetable</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                )}
                                                {effectiveAutocomplete && (
                                                    <Tooltip>
                                                        <TooltipTrigger>
                                                            <div className="p-1 rounded bg-amber-50 text-amber-600">
                                                                <Sparkles className="h-3.5 w-3.5" />
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            <p className="text-xs">Autocomplete</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                )}
                                            </TooltipProvider>

                                            {/* Configure button */}
                                            {!readOnly && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
                                                    onClick={() => openSheet(field)}
                                                >
                                                    <Settings2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            {/* ── Unified Field Config Sheet (one instance for the whole table) ── */}
            <FieldConfigSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                field={sheetField}
                config={sheetConfig}
                sourceFieldPath={sheetSourcePath}
                isVectorSource={sheetMapping?.isVectorSource}
                sourceFields={sourceFields}
                usedSourceFields={usedSourceFields}
                hasSourceData={hasSourceData}
                allFields={fields}
                localMappings={mappings}
                onMappingChange={(path, cfg, vectorSource) =>
                    sheetField && onMappingChange(sheetField.id, path, cfg, vectorSource)
                }
                onAttributeChange={handleAttributeChangeInternal}
                searchProvider={searchProvider}
                isVectorSearchEnabled={isVectorSearchEnabled}
                readOnly={readOnly}
            />
        </>
    );
}

export default FieldMappingTable;
