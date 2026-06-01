// app/playground/search/_components/SortBuilder.tsx

'use client';

/**
 * Sort Builder
 *
 * UI for building search sort clauses. Uses free-form field name input
 * so it works with or without index field context.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    ArrowUp,
    ArrowDown,
    Plus,
    Trash2,
} from 'lucide-react';

import type { SortClause } from '../_lib/hooks/useSearchPlayground';

interface SortBuilderProps {
    sorts: SortClause[];
    onSortsChange: (sorts: SortClause[]) => void;
}

export function SortBuilder({ sorts, onSortsChange }: SortBuilderProps) {
    const [newSort, setNewSort] = useState<Partial<SortClause>>({
        field: '',
        direction: 'asc',
    });

    const addSort = () => {
        if (!newSort.field?.trim()) return;
        const sort: SortClause = {
            field: newSort.field.trim(),
            direction: newSort.direction ?? 'asc',
            ...(newSort.missing ? { missing: newSort.missing } : {}),
        };
        onSortsChange([...sorts, sort]);
        setNewSort({ field: '', direction: 'asc' });
    };

    const removeSort = (index: number) => {
        onSortsChange(sorts.filter((_, i) => i !== index));
    };

    const clearSorts = () => {
        onSortsChange([]);
    };

    return (
        <div className="space-y-3">
            {/* Active Sorts */}
            {sorts.length > 0 && (
                <div className="space-y-2">
                    {sorts.map((sort, index) => (
                        <div
                            key={index}
                            className="flex items-center gap-2 p-2 bg-muted/50 rounded text-xs"
                        >
                            {sort.direction === 'asc' ? (
                                <ArrowUp className="h-3 w-3 text-blue-500 shrink-0" />
                            ) : (
                                <ArrowDown className="h-3 w-3 text-orange-500 shrink-0" />
                            )}
                            <span className="font-medium flex-1 truncate">{sort.field}</span>
                            <Badge
                                variant="outline"
                                className={`text-[10px] shrink-0 ${sort.direction === 'asc' ? 'text-blue-600' : 'text-orange-600'}`}
                            >
                                {sort.direction}
                            </Badge>
                            {sort.missing && (
                                <span className="text-muted-foreground shrink-0">{sort.missing}</span>
                            )}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0 ml-auto shrink-0"
                                onClick={() => removeSort(index)}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    ))}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearSorts}
                        className="text-xs h-7"
                    >
                        Clear All
                    </Button>
                </div>
            )}

            {/* Add New Sort */}
            <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs text-muted-foreground">Add Sort</Label>

                <Input
                    placeholder="Field name (e.g. price, date)"
                    value={newSort.field || ''}
                    onChange={(e) => setNewSort(prev => ({ ...prev, field: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && addSort()}
                    className="h-8 text-xs"
                />

                <div className="flex gap-2">
                    <Select
                        value={newSort.direction}
                        onValueChange={(v) => setNewSort(prev => ({
                            ...prev,
                            direction: v as 'asc' | 'desc',
                        }))}
                    >
                        <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="asc">
                                <div className="flex items-center gap-2">
                                    <ArrowUp className="h-3 w-3 text-blue-500" />
                                    <span>Ascending</span>
                                </div>
                            </SelectItem>
                            <SelectItem value="desc">
                                <div className="flex items-center gap-2">
                                    <ArrowDown className="h-3 w-3 text-orange-500" />
                                    <span>Descending</span>
                                </div>
                            </SelectItem>
                        </SelectContent>
                    </Select>

                    <Select
                        value={newSort.missing || 'none'}
                        onValueChange={(v) => setNewSort(prev => ({
                            ...prev,
                            missing: v === 'none' ? undefined : v as '_first' | '_last',
                        }))}
                    >
                        <SelectTrigger className="h-8 text-xs w-24">
                            <SelectValue placeholder="Missing" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">Default</SelectItem>
                            <SelectItem value="_first">First</SelectItem>
                            <SelectItem value="_last">Last</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <Button
                    size="sm"
                    onClick={addSort}
                    disabled={!newSort.field?.trim()}
                    className="w-full h-8 text-xs gap-1"
                >
                    <Plus className="h-3 w-3" />
                    Add Sort
                </Button>
            </div>
        </div>
    );
}
