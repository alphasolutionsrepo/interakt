// app/search-indexes/_components/FilterValueMappingsModal.tsx

/**
 * Filter Value Mappings Modal
 *
 * Allows admins to configure canonical value mappings for facetable fields.
 * These mappings are used to validate and normalize filter values suggested by AI in chat.
 *
 * Structure: { "CanonicalValue": ["alias1", "alias2", ...] }
 * Example: { "Men": ["men", "male", "boys"], "Women": ["women", "female", "ladies"] }
 *
 * Supports auto-generation from indexed values via the "Auto-generate from index" button.
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    Plus,
    X,
    Trash2,
    Info,
    ArrowRight,
    AlertCircle,
    Loader2,
    Sparkles,
    Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

export type FilterValueMappings = Record<string, string[]>;

interface FilterValueMappingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fieldName: string;
    fieldDisplayName: string;
    initialMappings: FilterValueMappings;
    onSave: (mappings: FilterValueMappings) => void;
    /**
     * Optional callback to fetch distinct indexed values for auto-generation.
     * When provided, the "Auto-generate from index" button is shown.
     */
    onFetchDistinctValues?: () => Promise<{
        values: Array<{ value: string; count: number }>;
        totalDistinct: number;
    }>;
}

interface CanonicalEntry {
    id: string;
    canonical: string;
    aliases: string[];
    /** Document count from index (shown as badge when auto-generated) */
    docCount?: number;
}

// ============================================================================
// HELPERS
// ============================================================================

function generateId(): string {
    return Math.random().toString(36).substring(2, 9);
}

function mappingsToEntries(mappings: FilterValueMappings): CanonicalEntry[] {
    return Object.entries(mappings).map(([canonical, aliases]) => ({
        id: generateId(),
        canonical,
        aliases: [...aliases],
    }));
}

function entriesToMappings(entries: CanonicalEntry[]): FilterValueMappings {
    const mappings: FilterValueMappings = {};
    for (const entry of entries) {
        if (entry.canonical.trim()) {
            mappings[entry.canonical.trim()] = entry.aliases
                .map(a => a.trim())
                .filter(a => a.length > 0);
        }
    }
    return mappings;
}

// ============================================================================
// CANONICAL VALUE ROW
// ============================================================================

interface CanonicalValueRowProps {
    entry: CanonicalEntry;
    onUpdate: (entry: CanonicalEntry) => void;
    onDelete: () => void;
    isDuplicate: boolean;
}

function CanonicalValueRow({ entry, onUpdate, onDelete, isDuplicate }: CanonicalValueRowProps) {
    const [newAlias, setNewAlias] = useState('');

    const handleCanonicalChange = (value: string) => {
        onUpdate({ ...entry, canonical: value });
    };

    const handleAddAlias = () => {
        if (newAlias.trim()) {
            onUpdate({
                ...entry,
                aliases: [...entry.aliases, newAlias.trim()],
            });
            setNewAlias('');
        }
    };

    const handleRemoveAlias = (index: number) => {
        onUpdate({
            ...entry,
            aliases: entry.aliases.filter((_, i) => i !== index),
        });
    };

    const handleAliasKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddAlias();
        }
    };

    return (
        <div className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-md border",
            isDuplicate ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
        )}>
            {/* Canonical Value */}
            <div className="flex-1 flex items-center gap-1.5 min-w-0">
                <Input
                    value={entry.canonical}
                    onChange={(e) => handleCanonicalChange(e.target.value)}
                    placeholder="e.g., Men"
                    className={cn(
                        "h-7 text-sm font-medium",
                        isDuplicate && "border-red-300 focus-visible:ring-red-400"
                    )}
                />
                {entry.docCount !== undefined && (
                    <Badge variant="outline" className="text-[10px] h-5 shrink-0 text-slate-400">
                        {entry.docCount}
                    </Badge>
                )}
                {isDuplicate && (
                    <Badge variant="destructive" className="text-[10px] h-5 shrink-0">
                        Duplicate
                    </Badge>
                )}
            </div>

            {/* Arrow */}
            <ArrowRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />

            {/* Aliases */}
            <div className="flex-2 flex flex-wrap items-center gap-1 min-h-7 px-2 py-1 border border-slate-200 rounded-md bg-slate-50">
                {entry.aliases.map((alias, index) => (
                    <Badge
                        key={index}
                        variant="secondary"
                        className="h-5 text-xs gap-0.5 pr-0.5"
                    >
                        {alias}
                        <button
                            type="button"
                            onClick={() => handleRemoveAlias(index)}
                            className="hover:bg-slate-300 rounded p-0.5"
                        >
                            <X className="h-2.5 w-2.5" />
                        </button>
                    </Badge>
                ))}
                <div className="flex items-center gap-0.5">
                    <Input
                        value={newAlias}
                        onChange={(e) => setNewAlias(e.target.value)}
                        onKeyDown={handleAliasKeyDown}
                        placeholder="Type & press Enter"
                        className="h-5 w-28 text-xs border-0 bg-transparent focus-visible:ring-0 p-0"
                    />
                    {newAlias.trim() && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleAddAlias}
                            className="h-5 w-5 p-0"
                        >
                            <Plus className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Delete Button */}
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="h-7 w-7 p-0 text-slate-400 hover:text-red-500 shrink-0"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FilterValueMappingsModal({
    open,
    onOpenChange,
    fieldName,
    fieldDisplayName,
    initialMappings,
    onSave,
    onFetchDistinctValues,
}: FilterValueMappingsModalProps) {
    const [entries, setEntries] = useState<CanonicalEntry[]>(() =>
        mappingsToEntries(initialMappings)
    );
    const [isAutoGenerating, setIsAutoGenerating] = useState(false);
    const [autoGenerateError, setAutoGenerateError] = useState<string | null>(null);
    const [autoGenerateCount, setAutoGenerateCount] = useState<number | null>(null);

    // Reset entries when modal opens with new initial mappings
    useMemo(() => {
        if (open) {
            setEntries(mappingsToEntries(initialMappings));
            setAutoGenerateError(null);
            setAutoGenerateCount(null);
        }
    }, [open, initialMappings]);

    // Track duplicates
    const duplicateCanonicals = useMemo(() => {
        const seen = new Set<string>();
        const duplicates = new Set<string>();
        for (const entry of entries) {
            const normalized = entry.canonical.toLowerCase().trim();
            if (normalized && seen.has(normalized)) {
                duplicates.add(normalized);
            }
            seen.add(normalized);
        }
        return duplicates;
    }, [entries]);

    const hasErrors = duplicateCanonicals.size > 0;

    const handleAddEntry = () => {
        setEntries(prev => [...prev, {
            id: generateId(),
            canonical: '',
            aliases: [],
        }]);
    };

    const handleUpdateEntry = useCallback((id: string, updated: CanonicalEntry) => {
        setEntries(prev => prev.map(e => e.id === id ? updated : e));
    }, []);

    const handleDeleteEntry = useCallback((id: string) => {
        setEntries(prev => prev.filter(e => e.id !== id));
    }, []);

    const handleSave = () => {
        if (hasErrors) return;
        const mappings = entriesToMappings(entries);
        onSave(mappings);
        onOpenChange(false);
    };

    const handleCancel = () => {
        setEntries(mappingsToEntries(initialMappings));
        onOpenChange(false);
    };

    const handleAutoGenerate = async () => {
        if (!onFetchDistinctValues) return;

        setIsAutoGenerating(true);
        setAutoGenerateError(null);
        setAutoGenerateCount(null);

        try {
            const result = await onFetchDistinctValues();

            // Merge with existing entries: keep existing canonicals, add new ones
            const existingCanonicals = new Set(
                entries.map(e => e.canonical.toLowerCase().trim()).filter(c => c.length > 0)
            );

            const newEntries: CanonicalEntry[] = [];
            for (const { value, count } of result.values) {
                if (!existingCanonicals.has(value.toLowerCase().trim())) {
                    // Auto-populate lowercase alias when canonical has mixed case
                    const lower = value.toLowerCase();
                    newEntries.push({
                        id: generateId(),
                        canonical: value,
                        aliases: lower !== value ? [lower] : [],
                        docCount: count,
                    });
                }
            }

            if (newEntries.length === 0 && result.values.length > 0) {
                setAutoGenerateError('All indexed values are already present as canonical values.');
            } else if (result.values.length === 0) {
                setAutoGenerateError('No indexed values found for this field. Make sure data has been indexed.');
            } else {
                setEntries(prev => [...prev, ...newEntries]);
                setAutoGenerateCount(newEntries.length);
            }
        } catch (err) {
            setAutoGenerateError(
                err instanceof Error ? err.message : 'Failed to fetch indexed values'
            );
        } finally {
            setIsAutoGenerating(false);
        }
    };

    const mappingCount = entries.filter(e => e.canonical.trim()).length;
    const aliasCount = entries.reduce((sum, e) => sum + e.aliases.length, 0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        Filter Value Mappings
                        <Badge variant="outline" className="font-mono text-xs">
                            {fieldDisplayName || fieldName}
                        </Badge>
                    </DialogTitle>
                    <DialogDescription className="text-sm">
                        Configure how filter values are normalized for this field.
                        When AI suggests a filter value, it will be matched against canonical values and their aliases.
                    </DialogDescription>
                </DialogHeader>

                {/* Info Banner */}
                <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                    <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-blue-800">
                        <p className="font-medium mb-1">How it works:</p>
                        <ul className="text-xs space-y-0.5 text-blue-700">
                            <li>AI suggests filter value (e.g., &quot;male&quot;, &quot;mens&quot;)</li>
                            <li>System normalizes and matches against aliases</li>
                            <li>If matched, uses the canonical value (e.g., &quot;Men&quot;) for the actual filter</li>
                            <li>If no match found, the filter is dropped (logged for analytics)</li>
                        </ul>
                    </div>
                </div>

                {/* Column Headers */}
                {entries.length > 0 && (
                    <div className="flex items-center gap-2 px-2.5 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                        <div className="flex-1">Canonical Value</div>
                        <div className="w-3.5" />
                        <div className="flex-2">Aliases</div>
                        <div className="w-7" />
                    </div>
                )}

                {/* Mappings List */}
                <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
                    <div className="space-y-1.5 py-1">
                        {entries.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">
                                <p className="mb-2">No mappings configured</p>
                                <p className="text-xs">
                                    Add canonical values and their aliases to enable filter validation.
                                    {onFetchDistinctValues && ' Or auto-generate from your indexed data.'}
                                </p>
                            </div>
                        ) : (
                            entries.map(entry => (
                                <CanonicalValueRow
                                    key={entry.id}
                                    entry={entry}
                                    onUpdate={(updated) => handleUpdateEntry(entry.id, updated)}
                                    onDelete={() => handleDeleteEntry(entry.id)}
                                    isDuplicate={duplicateCanonicals.has(entry.canonical.toLowerCase().trim())}
                                />
                            ))
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddEntry}
                        className="flex-1"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Canonical Value
                    </Button>

                    {onFetchDistinctValues && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAutoGenerate}
                            disabled={isAutoGenerating}
                            className="flex-1"
                        >
                            {isAutoGenerating ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Scanning index...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Auto-generate from index
                                </>
                            )}
                        </Button>
                    )}
                </div>

                {/* Auto-generate feedback */}
                {autoGenerateError && (
                    <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        {autoGenerateError}
                    </div>
                )}

                {/* Auto-generate success */}
                {autoGenerateCount !== null && (
                    <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                        <Check className="h-3.5 w-3.5 shrink-0" />
                        Added {autoGenerateCount} value{autoGenerateCount !== 1 ? 's' : ''} from index.
                        Review below, then hit Save Mappings.
                    </div>
                )}

                <DialogFooter className="flex items-center justify-between gap-4 pt-2 border-t">
                    <div className="text-xs text-slate-500">
                        {mappingCount} canonical value{mappingCount !== 1 ? 's' : ''}, {aliasCount} alias{aliasCount !== 1 ? 'es' : ''}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleCancel}>
                            Cancel
                        </Button>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span>
                                        <Button
                                            onClick={handleSave}
                                            disabled={hasErrors}
                                        >
                                            Save Mappings
                                        </Button>
                                    </span>
                                </TooltipTrigger>
                                {hasErrors && (
                                    <TooltipContent>
                                        <p className="flex items-center gap-1">
                                            <AlertCircle className="h-3 w-3" />
                                            Fix duplicate canonical values before saving
                                        </p>
                                    </TooltipContent>
                                )}
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
