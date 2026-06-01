// app/playground/search/_components/FilterBuilder.tsx

'use client';

/**
 * Filter Builder
 *
 * UI for building search filters.
 * Renders content only — the parent is responsible for providing any Card/Collapsible wrapper.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Plus,
    Trash2,
} from 'lucide-react';

import type { FilterClause, SearchContext } from '../_lib/hooks/useSearchPlayground';

interface FilterBuilderProps {
    filters: FilterClause[];
    onFiltersChange: (filters: FilterClause[]) => void;
    context: SearchContext | null;
    isLoading: boolean;
    allowFreeform?: boolean;
}

const OPERATORS = [
    { value: 'eq', label: 'Equals' },
    { value: 'neq', label: 'Not Equals' },
    { value: 'gt', label: 'Greater Than' },
    { value: 'gte', label: 'Greater Than or Equal' },
    { value: 'lt', label: 'Less Than' },
    { value: 'lte', label: 'Less Than or Equal' },
    { value: 'contains', label: 'Contains' },
    { value: 'prefix', label: 'Starts With' },
    { value: 'exists', label: 'Exists' },
    { value: 'missing', label: 'Is Missing' },
    { value: 'in', label: 'In (comma-separated)' },
];

export function FilterBuilder({
    filters,
    onFiltersChange,
    context,
    isLoading,
    allowFreeform = false,
}: FilterBuilderProps) {
    const [newFilter, setNewFilter] = useState<Partial<FilterClause>>({
        field: '',
        operator: 'eq',
        value: '',
    });

    // Get available fields for filtering
    const filterableFields = context
        ? Object.values(context.allFields).filter(f => f.isIndexed)
        : [];

    const useFreeform = allowFreeform || filterableFields.length === 0;

    const addFilter = () => {
        if (!newFilter.field || !newFilter.operator) return;

        const filter: FilterClause = {
            field: newFilter.field,
            operator: newFilter.operator,
        };

        if (newFilter.operator !== 'exists' && newFilter.operator !== 'missing') {
            if (newFilter.operator === 'in') {
                filter.value = String(newFilter.value)
                    .split(',')
                    .map(v => v.trim())
                    .filter(v => v);
            } else {
                const val = String(newFilter.value);
                filter.value = !isNaN(Number(val)) && val !== '' ? Number(val) : val;
            }
        }

        onFiltersChange([...filters, filter]);
        setNewFilter({ field: '', operator: 'eq', value: '' });
    };

    const removeFilter = (index: number) => {
        onFiltersChange(filters.filter((_, i) => i !== index));
    };

    const clearFilters = () => {
        onFiltersChange([]);
    };

    if (isLoading) {
        return (
            <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Active Filters */}
            {filters.length > 0 && (
                <div className="space-y-2">
                    {filters.map((filter, index) => (
                        <div
                            key={index}
                            className="flex items-center gap-2 p-2 bg-muted/50 rounded text-xs"
                        >
                            <span className="font-medium truncate max-w-[80px]">{filter.field}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                                {OPERATORS.find(o => o.value === filter.operator)?.label || filter.operator}
                            </Badge>
                            {filter.value !== undefined && (
                                <span className="text-muted-foreground truncate max-w-[80px]">
                                    {Array.isArray(filter.value)
                                        ? filter.value.join(', ')
                                        : String(filter.value)}
                                </span>
                            )}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0 ml-auto shrink-0"
                                onClick={() => removeFilter(index)}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    ))}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="text-xs h-7"
                    >
                        Clear All
                    </Button>
                </div>
            )}

            {/* Add New Filter */}
            <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs text-muted-foreground">Add Filter</Label>

                {useFreeform ? (
                    <Input
                        placeholder="Field name"
                        value={newFilter.field || ''}
                        onChange={(e) => setNewFilter(prev => ({ ...prev, field: e.target.value }))}
                        className="h-8 text-xs"
                    />
                ) : (
                    <Select
                        value={newFilter.field}
                        onValueChange={(v) => setNewFilter(prev => ({ ...prev, field: v }))}
                    >
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select field" />
                        </SelectTrigger>
                        <SelectContent>
                            {filterableFields.map((field) => (
                                <SelectItem key={field.fieldName} value={field.fieldName}>
                                    <div className="flex items-center gap-2">
                                        <span>{field.fieldName}</span>
                                        <Badge variant="outline" className="text-[9px]">
                                            {field.fieldType}
                                        </Badge>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                <Select
                    value={newFilter.operator}
                    onValueChange={(v) => setNewFilter(prev => ({ ...prev, operator: v }))}
                >
                    <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Operator" />
                    </SelectTrigger>
                    <SelectContent>
                        {OPERATORS.map((op) => (
                            <SelectItem key={op.value} value={op.value}>
                                {op.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {newFilter.operator !== 'exists' && newFilter.operator !== 'missing' && (
                    <Input
                        placeholder={newFilter.operator === 'in' ? 'val1, val2, val3' : 'Value'}
                        value={String(newFilter.value || '')}
                        onChange={(e) => setNewFilter(prev => ({ ...prev, value: e.target.value }))}
                        className="h-8 text-xs"
                    />
                )}

                <Button
                    size="sm"
                    onClick={addFilter}
                    disabled={!newFilter.field}
                    className="w-full h-8 text-xs gap-1"
                >
                    <Plus className="h-3 w-3" />
                    Add Filter
                </Button>
            </div>
        </div>
    );
}
