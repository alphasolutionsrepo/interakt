// app/search-indexes/_components/AdditionalDataSelector.tsx

/**
 * Additional Data Selector Component
 * 
 * Allows users to select which unmapped source fields should be
 * collected into the additionalData field during indexing.
 * 
 * This provides explicit control over what data is preserved,
 * avoiding automatic collection of unwanted fields.
 */

'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';


import {
    Search,
    Database,
    CheckCircle2,
    Info,
    Filter,
    Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ParsedSourceField } from '@/features/search-index';

// ============================================================================
// TYPES
// ============================================================================

interface AdditionalDataSelectorProps {
    /** All parsed source fields from the sample JSON */
    sourceFields: ParsedSourceField[];

    /** Source field paths that are already mapped to index fields */
    mappedSourcePaths: Set<string>;

    /** Currently selected field paths for additionalData */
    selectedPaths: string[];

    /** Callback when selection changes */
    onSelectionChange: (paths: string[]) => void;

    /** Whether the selector is disabled */
    disabled?: boolean;
}

interface UnmappedFieldItemProps {
    field: ParsedSourceField;
    isSelected: boolean;
    onToggle: (selected: boolean) => void;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getTypeColor(inferredType: string): string {
    const colors: Record<string, string> = {
        string: 'bg-blue-50 text-blue-700 border-blue-200',
        number: 'bg-green-50 text-green-700 border-green-200',
        boolean: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        null: 'bg-slate-50 text-slate-500 border-slate-200',
        object: 'bg-purple-50 text-purple-700 border-purple-200',
        'array:string': 'bg-blue-50 text-blue-700 border-blue-200',
        'array:number': 'bg-green-50 text-green-700 border-green-200',
        'array:boolean': 'bg-yellow-50 text-yellow-700 border-yellow-200',
        'array:object': 'bg-purple-50 text-purple-700 border-purple-200',
        'array:mixed': 'bg-orange-50 text-orange-700 border-orange-200',
    };
    return colors[inferredType] || 'bg-slate-50 text-slate-600 border-slate-200';
}

function formatSampleValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') {
        return value.length > 50 ? `"${value.slice(0, 50)}..."` : `"${value}"`;
    }
    if (typeof value === 'object') {
        if (Array.isArray(value)) {
            return `[${value.length} items]`;
        }
        return '{...}';
    }
    return String(value);
}

function getTypeLabel(inferredType: string): string {
    const labels: Record<string, string> = {
        string: 'string',
        number: 'number',
        boolean: 'boolean',
        null: 'null',
        object: 'object',
        'array:string': 'string[]',
        'array:number': 'number[]',
        'array:boolean': 'boolean[]',
        'array:object': 'object[]',
        'array:mixed': 'mixed[]',
    };
    return labels[inferredType] || inferredType;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function UnmappedFieldItem({ field, isSelected, onToggle }: UnmappedFieldItemProps) {
    return (
        <div
            className={cn(
                'flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
                isSelected
                    ? 'bg-green-50 border-green-200'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
            )}
            onClick={() => onToggle(!isSelected)}
        >
            <Checkbox
                checked={isSelected}
                onCheckedChange={onToggle}
                className="mt-0.5"
            />

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-slate-900">
                        {field.path}
                    </span>
                    <Badge
                        variant="outline"
                        className={cn('text-[10px]', getTypeColor(field.inferredType))}
                    >
                        {getTypeLabel(field.inferredType)}
                    </Badge>
                </div>

                <div className="mt-1 text-xs text-slate-500 truncate">
                    Sample: <span className="font-mono">{formatSampleValue(field.sampleValue)}</span>
                </div>
            </div>
        </div>
    );
}

function EmptyUnmappedState() {
    return (
        <div className="text-center py-8">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">All fields are mapped!</p>
            <p className="text-xs text-slate-500 mt-1">
                There are no unmapped source fields to collect.
            </p>
        </div>
    );
}

function NoSourceDataState() {
    return (
        <div className="text-center py-8">
            <Database className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">No source data loaded</p>
            <p className="text-xs text-slate-500 mt-1">
                Load a sample JSON to see available fields.
            </p>
        </div>
    );
}

// ============================================================================
// MAIN COMPONENT - INLINE VERSION
// ============================================================================

export function AdditionalDataSelector({
    sourceFields,
    mappedSourcePaths,
    selectedPaths,
    onSelectionChange,
    disabled,
}: AdditionalDataSelectorProps) {
    const [searchTerm, setSearchTerm] = useState('');

    // Get unmapped fields
    const unmappedFields = useMemo(() => {
        return sourceFields.filter(sf => !mappedSourcePaths.has(sf.path));
    }, [sourceFields, mappedSourcePaths]);

    // Filter by search term
    const filteredFields = useMemo(() => {
        if (!searchTerm) return unmappedFields;
        const term = searchTerm.toLowerCase();
        return unmappedFields.filter(sf =>
            sf.path.toLowerCase().includes(term) ||
            sf.inferredType.toLowerCase().includes(term)
        );
    }, [unmappedFields, searchTerm]);

    // Create a set for quick lookup
    const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);

    const handleToggle = (path: string, selected: boolean) => {
        if (selected) {
            onSelectionChange([...selectedPaths, path]);
        } else {
            onSelectionChange(selectedPaths.filter(p => p !== path));
        }
    };

    const handleSelectAll = () => {
        const allPaths = filteredFields.map(f => f.path);
        const newPaths = [...new Set([...selectedPaths, ...allPaths])];
        onSelectionChange(newPaths);
    };

    const handleClearAll = () => {
        // Only clear visible (filtered) fields
        const visiblePaths = new Set(filteredFields.map(f => f.path));
        onSelectionChange(selectedPaths.filter(p => !visiblePaths.has(p)));
    };

    if (sourceFields.length === 0) {
        return <NoSourceDataState />;
    }

    if (unmappedFields.length === 0) {
        return <EmptyUnmappedState />;
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-base">Additional Data Fields</CardTitle>
                        <CardDescription className="text-xs">
                            Select unmapped source fields to preserve in additionalData
                        </CardDescription>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                        {selectedPaths.length} of {unmappedFields.length} selected
                    </Badge>
                </div>
            </CardHeader>

            <CardContent className="space-y-3">
                {/* Search and actions */}
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search fields..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 h-8 text-sm"
                            disabled={disabled}
                        />
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAll}
                        disabled={disabled || filteredFields.length === 0}
                        className="h-8 text-xs"
                    >
                        Select All
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearAll}
                        disabled={disabled || selectedPaths.length === 0}
                        className="h-8 text-xs"
                    >
                        Clear
                    </Button>
                </div>

                {/* Info alert */}
                <div className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                    <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700">
                        Selected fields will be stored in the <code className="bg-blue-100 px-1 rounded">additionalData</code> object
                        for each document. Only select fields you need to preserve.
                    </p>
                </div>

                {/* Field list */}
                <ScrollArea className="h-[300px] rounded-lg border border-slate-200">
                    <div className="p-2 space-y-2">
                        {filteredFields.length === 0 ? (
                            <div className="text-center py-6 text-sm text-slate-500">
                                No fields match your search
                            </div>
                        ) : (
                            filteredFields.map((field) => (
                                <UnmappedFieldItem
                                    key={field.path}
                                    field={field}
                                    isSelected={selectedSet.has(field.path)}
                                    onToggle={(selected) => handleToggle(field.path, selected)}
                                />
                            ))
                        )}
                    </div>
                </ScrollArea>

                {/* Selected summary */}
                {selectedPaths.length > 0 && (
                    <div className="pt-2 border-t border-slate-200">
                        <Label className="text-xs text-slate-600 mb-2 block">
                            Selected fields ({selectedPaths.length}):
                        </Label>
                        <div className="flex flex-wrap gap-1">
                            {selectedPaths.slice(0, 10).map((path) => (
                                <Badge
                                    key={path}
                                    variant="secondary"
                                    className="text-xs font-mono cursor-pointer hover:bg-red-100"
                                    onClick={() => handleToggle(path, false)}
                                >
                                    {path}
                                    <Trash2 className="h-3 w-3 ml-1 text-slate-400" />
                                </Badge>
                            ))}
                            {selectedPaths.length > 10 && (
                                <Badge variant="outline" className="text-xs">
                                    +{selectedPaths.length - 10} more
                                </Badge>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ============================================================================
// DIALOG VERSION
// ============================================================================

interface AdditionalDataDialogProps extends AdditionalDataSelectorProps {
    trigger?: React.ReactNode;
    onSave?: () => void;
}

export function AdditionalDataDialog({
    sourceFields,
    mappedSourcePaths,
    selectedPaths,
    onSelectionChange,
    disabled,
    trigger,
    onSave,
}: AdditionalDataDialogProps) {
    const [open, setOpen] = useState(false);
    const [localSelection, setLocalSelection] = useState<string[]>(selectedPaths);

    // Sync local state when dialog opens
    const handleOpenChange = (isOpen: boolean) => {
        if (isOpen) {
            setLocalSelection(selectedPaths);
        }
        setOpen(isOpen);
    };

    const handleSave = () => {
        onSelectionChange(localSelection);
        onSave?.();
        setOpen(false);
    };

    const unmappedCount = sourceFields.filter(sf => !mappedSourcePaths.has(sf.path)).length;

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" size="sm" disabled={disabled}>
                        <Filter className="h-4 w-4 mr-2" />
                        Configure Additional Data
                        {selectedPaths.length > 0 && (
                            <Badge variant="secondary" className="ml-2">
                                {selectedPaths.length}
                            </Badge>
                        )}
                    </Button>
                )}
            </DialogTrigger>

            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Configure Additional Data Collection</DialogTitle>
                    <DialogDescription>
                        Select which unmapped source fields to preserve in the additionalData field.
                        {unmappedCount > 0 && ` ${unmappedCount} unmapped field(s) available.`}
                    </DialogDescription>
                </DialogHeader>

                <AdditionalDataSelector
                    sourceFields={sourceFields}
                    mappedSourcePaths={mappedSourcePaths}
                    selectedPaths={localSelection}
                    onSelectionChange={setLocalSelection}
                    disabled={disabled}
                />

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave}>
                        Save Selection ({localSelection.length} fields)
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}