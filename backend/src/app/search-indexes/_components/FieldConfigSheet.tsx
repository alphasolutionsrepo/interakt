// app/search-indexes/_components/FieldConfigSheet.tsx

/**
 * FieldConfigSheet - Unified Field Configuration Panel
 *
 * A single right-side Sheet replacing the two separate popovers (FieldValueCell +
 * FieldSettingsPopover).  Organized into three sections:
 *   1. VALUE & SOURCE  — mapping mode, source selection, value transforms
 *   2. SEARCH BEHAVIOR — searchable/facetable/autocomplete/boost/provider settings
 *   3. FILTER MAPPINGS — manage canonical-value mappings (when facetable)
 */

'use client';

import { useEffect, useState } from 'react';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    TooltipProvider,
} from '@/components/ui/tooltip';
import {
    AlertCircle,
    Search,
    Filter,
    FileJson,
    Zap,
    Brain,
    Sparkles,
    ListFilter,
} from 'lucide-react';
import { FilterValueMappingsModal } from './FilterValueMappingsModal';
import { searchIndexFieldsApi } from '../_lib/api-client';
import { getProviderUI } from './providers';
import { cn } from '@/lib/utils';
import type {
    SearchIndexField,
    ParsedSourceField,
    FieldMappingConfig,
    MappingMode,
    GeneratorType,
    ValueTransform,
    ComputedAggregation,
    ComputedFieldConfig,
} from '@/features/search-index';
import {
    MAPPING_MODES,
    MAPPING_MODE_INFO,
    GENERATOR_TYPES,
    GENERATOR_TYPE_INFO,
    VALUE_TRANSFORMS,
    VALUE_TRANSFORM_INFO,
    COMPUTED_AGGREGATIONS,
    COMPUTED_AGGREGATION_INFO,
    getFieldMappingConfig,
} from '@/features/search-index';
import type { FieldMapping, FieldAttributeChange } from './FieldMappingTable';

// ============================================================================
// TYPES
// ============================================================================

export interface FieldConfigSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    field: SearchIndexField | null;
    config: FieldMappingConfig;
    sourceFieldPath: string | null;
    isVectorSource?: boolean;
    sourceFields: ParsedSourceField[];
    usedSourceFields: Set<string>;
    hasSourceData: boolean;
    allFields: SearchIndexField[];
    localMappings: FieldMapping[];
    onMappingChange: (sourceFieldPath: string | null, config: FieldMappingConfig, isVectorSource?: boolean) => void;
    onAttributeChange?: (change: FieldAttributeChange) => void;
    searchProvider?: string;
    isVectorSearchEnabled?: boolean;
    readOnly?: boolean;
}

// ============================================================================
// FIELD TYPE BADGE COLORS (duplicated from table to keep component self-contained)
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

// ============================================================================
// COMPONENT
// ============================================================================

export function FieldConfigSheet({
    open,
    onOpenChange,
    field,
    config,
    sourceFieldPath,
    isVectorSource,
    sourceFields,
    usedSourceFields,
    hasSourceData,
    allFields,
    localMappings,
    onMappingChange,
    onAttributeChange,
    searchProvider,
    isVectorSearchEnabled,
    readOnly,
}: FieldConfigSheetProps) {
    // ── Attribute local state (optimistic) ──
    const [localSearchable, setLocalSearchable] = useState(false);
    const [localFacetable, setLocalFacetable] = useState(false);
    const [localIncludeInResponse, setLocalIncludeInResponse] = useState(true);
    const [localBoost, setLocalBoost] = useState(1);
    const [localAutocomplete, setLocalAutocomplete] = useState(false);
    const [localProviderSettings, setLocalProviderSettings] = useState<Record<string, unknown>>({});
    const [filterMappingsOpen, setFilterMappingsOpen] = useState(false);

    // Re-sync attribute state when opening a new field
    useEffect(() => {
        if (field && open) {
            setLocalSearchable(field.isSearchable ?? false);
            setLocalFacetable(field.isFacetable ?? false);
            setLocalIncludeInResponse(field.includeInResponse ?? true);
            setLocalBoost(field.boostValue ?? 1);
            setLocalAutocomplete(field.isAutocomplete ?? false);
            setLocalProviderSettings(field.providerFieldSettings ?? {});
        }
    }, [field?.id, open]);

    if (!field) return null;

    // ── Mapping handlers ──
    const handleModeChange = (mode: MappingMode) => {
        const newConfig: FieldMappingConfig = {
            mode,
            transform: config.transform || 'none',
        };
        if (mode === 'generated' && !newConfig.generator) {
            newConfig.generator = 'uuid';
        }
        if (mode === 'static' || mode === 'default') {
            newConfig.staticValue = config.staticValue;
        }
        if (mode === 'computed') {
            newConfig.computed = config.computed || {
                sourceArrayPath: '',
                extractField: '',
                aggregation: 'unique',
            };
        }
        if (mode === 'collect') {
            newConfig.collectFields = config.collectFields || [];
        }
        if (mode === 'reference') {
            newConfig.sourceFromField = config.sourceFromField || '';
        }
        const newSourcePath = (mode === 'source' || mode === 'default') ? sourceFieldPath : null;
        onMappingChange(newSourcePath, newConfig);
    };

    const handleSourceChange = (path: string | null) => {
        onMappingChange(path, config);
    };

    const handleStaticValueChange = (value: string) => {
        let coercedValue: unknown = value;
        if (field.fieldType === 'number' && value !== '') {
            coercedValue = parseFloat(value) || 0;
        } else if (field.fieldType === 'boolean') {
            coercedValue = value === 'true';
        }
        onMappingChange(sourceFieldPath, { ...config, staticValue: coercedValue });
    };

    const handleGeneratorChange = (generator: GeneratorType) => {
        onMappingChange(sourceFieldPath, { ...config, generator });
    };

    const handleTransformChange = (transform: ValueTransform) => {
        onMappingChange(sourceFieldPath, { ...config, transform });
    };

    const handleComputedChange = (updates: Partial<ComputedFieldConfig>) => {
        const currentComputed = config.computed || {
            sourceArrayPath: '',
            extractField: '',
            aggregation: 'unique' as ComputedAggregation,
        };
        onMappingChange(sourceFieldPath, {
            ...config,
            computed: { ...currentComputed, ...updates },
        });
    };

    const handleVectorSourceChange = (checked: boolean) => {
        onMappingChange(sourceFieldPath, config, checked);
    };

    const handleReferenceFieldChange = (fieldName: string) => {
        onMappingChange(sourceFieldPath, { ...config, sourceFromField: fieldName });
    };

    // ── Attribute handlers ──
    const handleAttributeToggle = (key: keyof FieldAttributeChange, value: boolean | number) => {
        onAttributeChange?.({ fieldId: field.id, [key]: value });
    };

    const handleProviderFieldSettingsChange = (newSettings: Record<string, unknown>) => {
        setLocalProviderSettings(newSettings);
        onAttributeChange?.({ fieldId: field.id, providerFieldSettings: newSettings });
    };

    // ── Derived values ──
    const providerUI = getProviderUI(searchProvider || 'elasticsearch');
    const isVectorSourceCompatible = ['text', 'html', 'markdown', 'richtext'].includes(
        field.fieldType.toLowerCase()
    );
    const isAutocompleteCompatible = field.fieldType === 'text';
    const filterValueMappings = field.filterValueMappings ?? {};
    const mappingsCount = Object.keys(filterValueMappings).length;

    const hasReindexChanges =
        localSearchable !== (field.isSearchable ?? false) ||
        localFacetable !== (field.isFacetable ?? false) ||
        localAutocomplete !== (field.isAutocomplete ?? false);

    return (
        <>
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent side="right" className="w-[520px] sm:max-w-[520px] flex flex-col p-0">
                    <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
                        <SheetTitle className="flex items-center gap-2">
                            {field.displayName || field.fieldName}
                            <Badge
                                variant="outline"
                                className={cn(
                                    'text-xs font-mono font-normal',
                                    getFieldTypeBadgeColor(field.fieldType)
                                )}
                            >
                                {field.fieldType}
                            </Badge>
                        </SheetTitle>
                        {field.displayName && field.displayName !== field.fieldName && (
                            <SheetDescription className="font-mono text-xs">
                                {field.fieldName}
                            </SheetDescription>
                        )}
                    </SheetHeader>

                    <ScrollArea className="flex-1">
                        <div className="px-6 py-5 space-y-6">

                            {/* ── SECTION 1: VALUE & SOURCE ── */}
                            <div className="space-y-4">
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    Value &amp; Source
                                </h3>

                                {/* Mapping Mode */}
                                <div>
                                    <Label className="text-xs text-slate-500 mb-1.5 block">
                                        Mapping Mode
                                    </Label>
                                    <Select
                                        value={config.mode}
                                        onValueChange={(v) => handleModeChange(v as MappingMode)}
                                        disabled={readOnly}
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue>
                                                {MAPPING_MODE_INFO[config.mode]?.label || config.mode}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent className="w-[460px]">
                                            {MAPPING_MODES.map((mode) => (
                                                <SelectItem key={mode} value={mode}>
                                                    <div className="py-1">
                                                        <div className="font-medium">
                                                            {MAPPING_MODE_INFO[mode].label}
                                                        </div>
                                                        <div className="text-xs text-slate-500 mt-0.5">
                                                            {MAPPING_MODE_INFO[mode].description}
                                                        </div>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Source Field (source / default modes) */}
                                {(config.mode === 'source' || config.mode === 'default') && (
                                    <div>
                                        <Label className="text-xs text-slate-500 mb-1.5 block">
                                            Source Field
                                        </Label>
                                        {hasSourceData ? (
                                            <Select
                                                value={sourceFieldPath || ''}
                                                onValueChange={(v) =>
                                                    handleSourceChange(v === '__clear__' ? null : v || null)
                                                }
                                                disabled={readOnly}
                                            >
                                                <SelectTrigger className="h-9 font-mono text-sm">
                                                    <SelectValue placeholder="Select source field..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {sourceFieldPath && (
                                                        <SelectItem value="__clear__">
                                                            Clear mapping
                                                        </SelectItem>
                                                    )}
                                                    {sourceFields.map((sf) => {
                                                        const isUsed =
                                                            usedSourceFields.has(sf.path) &&
                                                            sf.path !== sourceFieldPath;
                                                        return (
                                                            <SelectItem
                                                                key={sf.path}
                                                                value={sf.path}
                                                                disabled={isUsed}
                                                            >
                                                                <span className="font-mono">
                                                                    {sf.path}
                                                                </span>
                                                                {isUsed && (
                                                                    <span className="text-slate-400 ml-2">
                                                                        (in use)
                                                                    </span>
                                                                )}
                                                            </SelectItem>
                                                        );
                                                    })}
                                                </SelectContent>
                                            </Select>
                                        ) : sourceFieldPath ? (
                                            <div className="text-sm font-mono px-3 py-2 bg-slate-50 rounded-md border">
                                                {sourceFieldPath}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-slate-400 italic">
                                                Load JSON sample to select source fields
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Static / Default Value */}
                                {(config.mode === 'static' || config.mode === 'default') && (
                                    <div>
                                        <Label className="text-xs text-slate-500 mb-1.5 block">
                                            {config.mode === 'static' ? 'Static Value' : 'Fallback Value'}
                                        </Label>
                                        {field.fieldType === 'boolean' ? (
                                            <Select
                                                value={
                                                    config.staticValue !== undefined
                                                        ? String(config.staticValue)
                                                        : ''
                                                }
                                                onValueChange={handleStaticValueChange}
                                                disabled={readOnly}
                                            >
                                                <SelectTrigger className="h-9">
                                                    <SelectValue placeholder="Select value..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="true">true</SelectItem>
                                                    <SelectItem value="false">false</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <Input
                                                type={field.fieldType === 'number' ? 'number' : 'text'}
                                                value={
                                                    config.staticValue !== undefined
                                                        ? String(config.staticValue)
                                                        : ''
                                                }
                                                onChange={(e) => handleStaticValueChange(e.target.value)}
                                                placeholder={
                                                    config.mode === 'default'
                                                        ? 'Value if source is empty...'
                                                        : 'Enter value...'
                                                }
                                                className="h-9"
                                                disabled={readOnly}
                                            />
                                        )}
                                        {config.mode === 'default' && (
                                            <p className="text-xs text-slate-500 mt-1">
                                                Used when source field is missing or empty
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Generator */}
                                {config.mode === 'generated' && (
                                    <div>
                                        <Label className="text-xs text-slate-500 mb-1.5 block">
                                            Generator
                                        </Label>
                                        <Select
                                            value={config.generator || 'uuid'}
                                            onValueChange={(v) => handleGeneratorChange(v as GeneratorType)}
                                            disabled={readOnly}
                                        >
                                            <SelectTrigger className="h-9">
                                                <SelectValue>
                                                    {GENERATOR_TYPE_INFO[config.generator || 'uuid']?.label ||
                                                        config.generator}
                                                </SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                                {GENERATOR_TYPES.map((gen) => (
                                                    <SelectItem key={gen} value={gen}>
                                                        <div className="py-1">
                                                            <div className="font-medium">
                                                                {GENERATOR_TYPE_INFO[gen].label}
                                                            </div>
                                                            <div className="text-xs text-slate-500 mt-0.5">
                                                                {GENERATOR_TYPE_INFO[gen].description}
                                                            </div>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                {/* Computed Field Config */}
                                {config.mode === 'computed' && (
                                    <div className="space-y-3">
                                        <div>
                                            <Label className="text-xs text-slate-500 mb-1.5 block">
                                                Source Array Path
                                            </Label>
                                            <Input
                                                value={config.computed?.sourceArrayPath || ''}
                                                onChange={(e) =>
                                                    handleComputedChange({ sourceArrayPath: e.target.value })
                                                }
                                                placeholder="e.g., variants"
                                                className="h-9 font-mono text-sm"
                                                disabled={readOnly}
                                            />
                                            <p className="text-xs text-slate-500 mt-1">
                                                Path to the array in source document
                                            </p>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500 mb-1.5 block">
                                                Extract Field
                                            </Label>
                                            <Input
                                                value={config.computed?.extractField || ''}
                                                onChange={(e) =>
                                                    handleComputedChange({ extractField: e.target.value })
                                                }
                                                placeholder="e.g., color, price"
                                                className="h-9 font-mono text-sm"
                                                disabled={readOnly}
                                            />
                                            <p className="text-xs text-slate-500 mt-1">
                                                Field to extract from each array item
                                            </p>
                                        </div>
                                        <div>
                                            <Label className="text-xs text-slate-500 mb-1.5 block">
                                                Aggregation
                                            </Label>
                                            <Select
                                                value={config.computed?.aggregation || 'unique'}
                                                onValueChange={(v) =>
                                                    handleComputedChange({
                                                        aggregation: v as ComputedAggregation,
                                                    })
                                                }
                                                disabled={readOnly}
                                            >
                                                <SelectTrigger className="h-9">
                                                    <SelectValue>
                                                        {COMPUTED_AGGREGATION_INFO[
                                                            config.computed?.aggregation || 'unique'
                                                        ]?.label || config.computed?.aggregation}
                                                    </SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {COMPUTED_AGGREGATIONS.map((agg) => (
                                                        <SelectItem key={agg} value={agg}>
                                                            <div className="py-1">
                                                                <div className="font-medium">
                                                                    {COMPUTED_AGGREGATION_INFO[agg].label}
                                                                </div>
                                                                <div className="text-xs text-slate-500 mt-0.5">
                                                                    {COMPUTED_AGGREGATION_INFO[agg].description}
                                                                </div>
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
                                            Example: Extract unique colors from{' '}
                                            <code className="bg-blue-100 px-1 rounded">
                                                variants[].color
                                            </code>
                                        </div>
                                    </div>
                                )}

                                {/* Collect Info */}
                                {config.mode === 'collect' && (
                                    <div className="text-sm text-slate-600 bg-cyan-50 border border-cyan-200 rounded-md px-3 py-2">
                                        <p>Collects unmapped source fields into this JSON field.</p>
                                        <p className="text-xs text-slate-500 mt-1">
                                            Configure which fields to collect in the Additional Data
                                            section.
                                        </p>
                                    </div>
                                )}

                                {/* Reference Field Selector */}
                                {config.mode === 'reference' && (
                                    <div>
                                        <Label className="text-xs text-slate-500 mb-1.5 block">
                                            Copy Value From Field
                                        </Label>
                                        <Select
                                            value={config.sourceFromField || ''}
                                            onValueChange={(v) => handleReferenceFieldChange(v || '')}
                                            disabled={readOnly}
                                        >
                                            <SelectTrigger className="h-9">
                                                <SelectValue placeholder="Select field..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {allFields
                                                    .filter((f) => {
                                                        if (f.fieldName === field.fieldName) return false;
                                                        if (f.sourceFieldName || f.sourceFieldPath)
                                                            return true;
                                                        const localMapping = localMappings?.find(
                                                            (m) => m.fieldId === f.id
                                                        );
                                                        if (localMapping?.sourceFieldPath) return true;
                                                        const fieldConfig = getFieldMappingConfig(
                                                            f.transformConfig
                                                        );
                                                        if (
                                                            ['static', 'generated', 'computed', 'collect'].includes(
                                                                fieldConfig.mode
                                                            )
                                                        )
                                                            return true;
                                                        return false;
                                                    })
                                                    .map((f) => (
                                                        <SelectItem key={f.fieldName} value={f.fieldName}>
                                                            <div className="py-1">
                                                                <div className="font-medium">{f.fieldName}</div>
                                                                <div className="text-xs text-slate-500 mt-0.5 font-mono">
                                                                    {f.sourceFieldPath || f.sourceFieldName}
                                                                </div>
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-slate-500 mt-1">
                                            Uses the same source value as the selected field
                                        </p>
                                    </div>
                                )}

                                {/* Value Transform */}
                                {config.mode !== 'none' && config.mode !== 'collect' && (
                                    <div>
                                        <Label className="text-xs text-slate-500 mb-1.5 block">
                                            Value Transform
                                        </Label>
                                        <Select
                                            value={config.transform || 'none'}
                                            onValueChange={(v) => handleTransformChange(v as ValueTransform)}
                                            disabled={readOnly}
                                        >
                                            <SelectTrigger className="h-9">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {VALUE_TRANSFORMS.map((t) => (
                                                    <SelectItem key={t} value={t}>
                                                        {VALUE_TRANSFORM_INFO[t].label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                {/* Vector Source Toggle */}
                                {isVectorSearchEnabled &&
                                    isVectorSourceCompatible &&
                                    config.mode !== 'none' && (
                                        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                                            <div className="flex items-center gap-2">
                                                <Brain className="h-4 w-4 text-indigo-600" />
                                                <div>
                                                    <Label className="text-sm font-medium">
                                                        Use for Embeddings
                                                    </Label>
                                                    <p className="text-xs text-slate-500">
                                                        Include this field in vector search
                                                    </p>
                                                </div>
                                            </div>
                                            <Switch
                                                checked={isVectorSource || false}
                                                onCheckedChange={handleVectorSourceChange}
                                                disabled={readOnly}
                                            />
                                        </div>
                                    )}
                            </div>

                            <Separator />

                            {/* ── SECTION 2: SEARCH BEHAVIOR ── */}
                            <div className="space-y-4">
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    Search Behavior
                                </h3>

                                {/* Reindex warning */}
                                {hasReindexChanges && (
                                    <Alert className="border-amber-200 bg-amber-50">
                                        <AlertCircle className="h-4 w-4 text-amber-600" />
                                        <AlertDescription className="text-amber-700 text-xs">
                                            Changes to Searchable, Facetable, or Autocomplete require
                                            reindexing after save.
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {/* Include in Response */}
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-medium flex items-center gap-2">
                                            <FileJson className="h-3.5 w-3.5 text-emerald-600" />
                                            Include in Response
                                        </Label>
                                        <p className="text-xs text-slate-500">
                                            Return this field in search results
                                        </p>
                                    </div>
                                    <Switch
                                        checked={localIncludeInResponse}
                                        onCheckedChange={(checked) => {
                                            setLocalIncludeInResponse(checked);
                                            handleAttributeToggle('includeInResponse', checked);
                                        }}
                                        disabled={readOnly}
                                    />
                                </div>

                                {/* Searchable */}
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-medium flex items-center gap-2">
                                            <Search className="h-3.5 w-3.5 text-blue-600" />
                                            Searchable
                                            <Badge
                                                variant="outline"
                                                className="text-[10px] text-amber-600 border-amber-200"
                                            >
                                                reindex
                                            </Badge>
                                        </Label>
                                        <p className="text-xs text-slate-500">
                                            Include in full-text search
                                        </p>
                                    </div>
                                    <Switch
                                        checked={localSearchable}
                                        onCheckedChange={(checked) => {
                                            setLocalSearchable(checked);
                                            handleAttributeToggle('isSearchable', checked);
                                        }}
                                        disabled={readOnly}
                                    />
                                </div>

                                {/* Facetable */}
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-medium flex items-center gap-2">
                                            <Filter className="h-3.5 w-3.5 text-violet-600" />
                                            Facetable
                                            <Badge
                                                variant="outline"
                                                className="text-[10px] text-amber-600 border-amber-200"
                                            >
                                                reindex
                                            </Badge>
                                        </Label>
                                        <p className="text-xs text-slate-500">
                                            Enable filtering and aggregations
                                        </p>
                                    </div>
                                    <Switch
                                        checked={localFacetable}
                                        onCheckedChange={(checked) => {
                                            setLocalFacetable(checked);
                                            handleAttributeToggle('isFacetable', checked);
                                        }}
                                        disabled={readOnly}
                                    />
                                </div>

                                {/* Autocomplete (text fields only) */}
                                {isAutocompleteCompatible && (
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-sm font-medium flex items-center gap-2">
                                                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                                Autocomplete
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] text-amber-600 border-amber-200"
                                                >
                                                    reindex
                                                </Badge>
                                            </Label>
                                            <p className="text-xs text-slate-500">
                                                Enable type-ahead suggestions
                                            </p>
                                        </div>
                                        <Switch
                                            checked={localAutocomplete}
                                            onCheckedChange={(checked) => {
                                                setLocalAutocomplete(checked);
                                                handleAttributeToggle('isAutocomplete', checked);
                                            }}
                                            disabled={readOnly}
                                        />
                                    </div>
                                )}

                                {/* Provider-specific field settings (e.g. Azure isSortable) */}
                                {providerUI?.FieldSettings && (
                                    <providerUI.FieldSettings
                                        fieldName={field.fieldName}
                                        fieldType={field.fieldType}
                                        value={localProviderSettings}
                                        onChange={handleProviderFieldSettingsChange}
                                    />
                                )}

                                {/* Search Boost (when searchable) */}
                                {localSearchable && (
                                    <div className="space-y-2">
                                        <Label className="text-sm font-medium flex items-center gap-2">
                                            <Zap className="h-3.5 w-3.5 text-amber-600" />
                                            Search Boost
                                        </Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                min={0.1}
                                                max={100}
                                                step={0.1}
                                                value={localBoost}
                                                onChange={(e) => {
                                                    const v = parseFloat(e.target.value) || 1;
                                                    setLocalBoost(v);
                                                    handleAttributeToggle('boostValue', v);
                                                }}
                                                className="h-8 w-24"
                                                disabled={readOnly}
                                            />
                                            <span className="text-xs text-slate-500">Default: 1.0</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── SECTION 3: FILTER VALUE MAPPINGS ── */}
                            {localFacetable && (
                                <>
                                    <Separator />
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                            Filter Value Mappings
                                        </h3>
                                        <p className="text-xs text-slate-500">
                                            Map AI-suggested filter values to actual indexed values for
                                            consistent filtering.
                                        </p>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setFilterMappingsOpen(true)}
                                            className="w-full h-9"
                                            disabled={readOnly}
                                        >
                                            <ListFilter className="h-3.5 w-3.5 mr-1.5" />
                                            {mappingsCount > 0
                                                ? `${mappingsCount} mapping${mappingsCount !== 1 ? 's' : ''} configured`
                                                : 'Configure Mappings'}
                                        </Button>
                                    </div>
                                </>
                            )}

                        </div>
                    </ScrollArea>

                    <SheetFooter className="px-6 py-4 border-t shrink-0">
                        <Button className="w-full" onClick={() => onOpenChange(false)}>
                            Done
                        </Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>

            {/* Filter Value Mappings Modal — rendered as sibling to avoid Sheet z-index issues */}
            <FilterValueMappingsModal
                open={filterMappingsOpen}
                onOpenChange={setFilterMappingsOpen}
                fieldName={field.fieldName}
                fieldDisplayName={field.displayName || field.fieldName}
                initialMappings={filterValueMappings}
                onSave={(mappings) => {
                    onAttributeChange?.({ fieldId: field.id, filterValueMappings: mappings });
                    setFilterMappingsOpen(false);
                }}
                onFetchDistinctValues={() =>
                    searchIndexFieldsApi.getFieldDistinctValues(field.searchIndexId, field.id)
                }
            />
        </>
    );
}

// Re-export tooltip provider for convenience
export { TooltipProvider };
