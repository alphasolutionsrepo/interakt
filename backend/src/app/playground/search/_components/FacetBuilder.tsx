// app/playground/search/_components/FacetBuilder.tsx

'use client';

/**
 * Facet Builder
 *
 * UI for building search facet requests.
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

import type { FacetRequest, SearchContext } from '../_lib/hooks/useSearchPlayground';

interface FacetBuilderProps {
    facets: FacetRequest[];
    onFacetsChange: (facets: FacetRequest[]) => void;
    context: SearchContext | null;
    isLoading: boolean;
    allowFreeform?: boolean;
}

const FACET_TYPES = [
    { value: 'terms', label: 'Terms', description: 'Count by unique values' },
    { value: 'range', label: 'Range', description: 'Numeric ranges' },
    { value: 'date_histogram', label: 'Date Histogram', description: 'Time buckets' },
    { value: 'histogram', label: 'Histogram', description: 'Numeric buckets' },
];

export function FacetBuilder({
    facets,
    onFacetsChange,
    context,
    isLoading,
    allowFreeform = false,
}: FacetBuilderProps) {
    const [newFacet, setNewFacet] = useState<Partial<FacetRequest>>({
        field: '',
        type: 'terms',
        size: 10,
    });

    const facetableFields = context?.facetableFields || [];
    const useFreeform = allowFreeform || facetableFields.length === 0;

    const addFacet = () => {
        if (!newFacet.field || !newFacet.type) return;

        const facet: FacetRequest = {
            field: newFacet.field,
            type: newFacet.type as FacetRequest['type'],
            size: newFacet.size || 10,
        };

        if (newFacet.type === 'histogram' && newFacet.interval) {
            facet.interval = Number(newFacet.interval);
        }
        if (newFacet.type === 'date_histogram' && newFacet.interval) {
            facet.interval = newFacet.interval;
        }

        onFacetsChange([...facets, facet]);
        setNewFacet({ field: '', type: 'terms', size: 10 });
    };

    const removeFacet = (index: number) => {
        onFacetsChange(facets.filter((_, i) => i !== index));
    };

    const clearFacets = () => {
        onFacetsChange([]);
    };

    // Quick add all facetable fields as terms facets
    const addAllFacets = () => {
        const newFacets = facetableFields
            .filter(f => !facets.some(ef => ef.field === f.fieldName))
            .map(f => ({
                field: f.fieldName,
                type: 'terms' as const,
                size: 10,
            }));
        onFacetsChange([...facets, ...newFacets]);
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
            {/* Active Facets */}
            {facets.length > 0 && (
                <div className="space-y-2">
                    {facets.map((facet, index) => (
                        <div
                            key={index}
                            className="flex items-center gap-2 p-2 bg-muted/50 rounded text-xs"
                        >
                            <span className="font-medium truncate flex-1">{facet.field}</span>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                                {facet.type}
                            </Badge>
                            {facet.size && (
                                <span className="text-muted-foreground shrink-0">
                                    ×{facet.size}
                                </span>
                            )}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0 shrink-0"
                                onClick={() => removeFacet(index)}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    ))}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFacets}
                        className="text-xs h-7"
                    >
                        Clear All
                    </Button>
                </div>
            )}

            {/* Quick Actions — only when context fields are available */}
            {facetableFields.length > 0 && facets.length < facetableFields.length && (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={addAllFacets}
                    className="w-full h-7 text-xs"
                >
                    Add All Facetable Fields ({facetableFields.length - facets.length})
                </Button>
            )}

            {/* Add New Facet */}
            <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs text-muted-foreground">Add Facet</Label>

                {useFreeform ? (
                    <Input
                        placeholder="Field name"
                        value={newFacet.field || ''}
                        onChange={(e) => setNewFacet(prev => ({ ...prev, field: e.target.value }))}
                        className="h-8 text-xs"
                    />
                ) : (
                    <Select
                        value={newFacet.field}
                        onValueChange={(v) => setNewFacet(prev => ({ ...prev, field: v }))}
                    >
                        <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select field" />
                        </SelectTrigger>
                        <SelectContent>
                            {facetableFields.map((field) => (
                                <SelectItem
                                    key={field.fieldName}
                                    value={field.fieldName}
                                    disabled={facets.some(f => f.field === field.fieldName)}
                                >
                                    <div className="flex items-center gap-2">
                                        <span>{field.displayName || field.fieldName}</span>
                                        <Badge variant="outline" className="text-[9px]">
                                            {field.fieldType}
                                        </Badge>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                <div className="flex gap-2">
                    <Select
                        value={newFacet.type}
                        onValueChange={(v) => setNewFacet(prev => ({
                            ...prev,
                            type: v as FacetRequest['type'],
                        }))}
                    >
                        <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {FACET_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                    {type.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Input
                        type="number"
                        placeholder="Size"
                        value={newFacet.size || ''}
                        onChange={(e) => setNewFacet(prev => ({
                            ...prev,
                            size: parseInt(e.target.value) || undefined,
                        }))}
                        className="h-8 w-16 text-xs"
                    />
                </div>

                {(newFacet.type === 'histogram' || newFacet.type === 'date_histogram') && (
                    <Input
                        placeholder={
                            newFacet.type === 'date_histogram'
                                ? 'Interval (day, week, month...)'
                                : 'Interval (number)'
                        }
                        value={newFacet.interval as string || ''}
                        onChange={(e) => setNewFacet(prev => ({
                            ...prev,
                            interval: e.target.value,
                        }))}
                        className="h-8 text-xs"
                    />
                )}

                <Button
                    size="sm"
                    onClick={addFacet}
                    disabled={!newFacet.field}
                    className="w-full h-8 text-xs gap-1"
                >
                    <Plus className="h-3 w-3" />
                    Add Facet
                </Button>
            </div>
        </div>
    );
}
