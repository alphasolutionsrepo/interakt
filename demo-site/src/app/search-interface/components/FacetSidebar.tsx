'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Search, ChevronDown, RotateCcw } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface FacetBucket {
  key: string;
  count?: number;
  doc_count?: number;
  original_key?: string;
}

interface Facet {
  field?: string;
  fieldName?: string;
  type?: string;
  facetType?: string;
  buckets: FacetBucket[];
  total_buckets?: number;
}

interface FacetSidebarProps {
  facets: Record<string, Facet>;
  selectedFacets: Record<string, string[]>;
  onFacetChange: (facetKey: string, values: string[]) => void;
  onClearAll: () => void;
  isLoading?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FacetSidebar({
  facets,
  selectedFacets,
  onFacetChange,
  onClearAll,
  isLoading = false,
}: FacetSidebarProps) {
  const [expandedFacets, setExpandedFacets] = useState<Set<string>>(
    new Set(Object.keys(facets).slice(0, 5))
  );
  const [facetSearch, setFacetSearch] = useState<Record<string, string>>({});

  const toggleFacetExpansion = (facetKey: string) => {
    const newExpanded = new Set(expandedFacets);
    if (newExpanded.has(facetKey)) {
      newExpanded.delete(facetKey);
    } else {
      newExpanded.add(facetKey);
    }
    setExpandedFacets(newExpanded);
  };

  const handleFacetValueToggle = (facetKey: string, value: string) => {
    const currentValues = selectedFacets[facetKey] || [];
    const newValues = currentValues.includes(value)
      ? currentValues.filter((v) => v !== value)
      : [...currentValues, value];

    onFacetChange(facetKey, newValues);
  };

  const getFilteredFacetBuckets = (facetKey: string, facet: Facet): FacetBucket[] => {
    const searchTerm = facetSearch[facetKey]?.toLowerCase() || '';
    return facet.buckets.filter((bucket) => {
      const key = bucket.key?.toLowerCase() || '';
      const originalKey = bucket.original_key?.toLowerCase() || '';
      return key.includes(searchTerm) || originalKey.includes(searchTerm);
    });
  };

  const getTotalSelectedCount = () => {
    return Object.values(selectedFacets).reduce((sum, values) => sum + values.length, 0);
  };

  const hasAnyFilters = getTotalSelectedCount() > 0;

  const getFacetDisplayName = (fieldName: string) => {
    const displayNames: Record<string, string> = {
      brand: 'Brand',
      categories: 'Categories',
      category: 'Category',
      availability: 'Availability',
      priceRange: 'Price Range',
      collections: 'Collections',
      colors: 'Colors',
      primaryColor: 'Color',
      materials: 'Materials',
      material: 'Material',
      size: 'Size',
      type: 'Type',
      gender: 'Gender',
      ageGroup: 'Age Group',
      season: 'Season',
      style: 'Style',
      subCategory: 'Sub Category',
      inStock: 'Availability',
      language: 'Language',
      currency: 'Currency',
      rating: 'Rating',
    };
    return displayNames[fieldName] || fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  const getBucketCount = (bucket: FacetBucket): number => {
    return bucket.count ?? bucket.doc_count ?? 0;
  };

  const getBucketDisplayLabel = (bucket: FacetBucket): string => {
    const label = bucket.original_key || bucket.key;
    // Handle boolean values
    if (label === 'true') return 'Yes';
    if (label === 'false') return 'No';
    return label;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-5 bg-muted rounded w-16 animate-pulse" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-3">
            <div className="h-4 bg-muted rounded w-24 animate-pulse" />
            <div className="space-y-2">
              {[1, 2, 3].map((j) => (
                <div key={j} className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-muted/50 rounded animate-pulse" />
                  <div className="h-3 bg-muted/50 rounded flex-1 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const facetEntries = Object.entries(facets).filter(
    ([, facet]) => facet.buckets && facet.buckets.length > 0
  );

  if (facetEntries.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-foreground tracking-tight">Filters</h2>
        {hasAnyFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-8 px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Reset
          </Button>
        )}
      </div>

      {/* Facet Groups */}
      <div className="space-y-1">
        {facetEntries.map(([facetKey, facet]) => {
          const isExpanded = expandedFacets.has(facetKey);
          const filteredBuckets = getFilteredFacetBuckets(facetKey, facet);
          const selectedCount = selectedFacets[facetKey]?.length || 0;

          return (
            <div
              key={facetKey}
              className="border-b border-border last:border-b-0"
            >
              {/* Facet Header */}
              <button
                onClick={() => toggleFacetExpansion(facetKey)}
                className="w-full flex items-center justify-between py-3.5 text-left group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-[15px] font-semibold text-foreground group-hover:text-foreground">
                    {getFacetDisplayName(facetKey)}
                  </span>
                  {selectedCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="h-5 min-w-[20px] px-1.5 text-xs bg-primary text-primary-foreground font-semibold"
                    >
                      {selectedCount}
                    </Badge>
                  )}
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Facet Content */}
              {isExpanded && (
                <div className="pb-4 space-y-2.5">
                  {/* Search within facet */}
                  {facet.buckets.length > 6 && (
                    <div className="relative mb-3">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder={`Search...`}
                        value={facetSearch[facetKey] || ''}
                        onChange={(e) =>
                          setFacetSearch((prev) => ({
                            ...prev,
                            [facetKey]: e.target.value,
                          }))
                        }
                        className="h-10 pl-10 text-sm bg-muted/50 border-border rounded-xl focus:bg-background font-medium"
                      />
                    </div>
                  )}

                  {/* Facet Values */}
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {filteredBuckets.slice(0, 12).map((bucket) => {
                      const isSelected = selectedFacets[facetKey]?.includes(bucket.key) || false;
                      return (
                        <label
                          key={bucket.key}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-primary/10'
                              : 'hover:bg-muted'
                          }`}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleFacetValueToggle(facetKey, bucket.key)}
                            className="w-5 h-5 rounded-md data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          />
                          <span className={`text-[15px] flex-1 truncate ${
                            isSelected ? 'text-foreground font-semibold' : 'text-foreground/80 font-medium'
                          }`}>
                            {getBucketDisplayLabel(bucket)}
                          </span>
                          <span className={`text-sm tabular-nums font-medium ${
                            isSelected ? 'text-foreground' : 'text-muted-foreground'
                          }`}>
                            {getBucketCount(bucket)}
                          </span>
                        </label>
                      );
                    })}

                    {filteredBuckets.length > 12 && (
                      <p className="text-sm text-muted-foreground text-center py-2 font-medium">
                        +{filteredBuckets.length - 12} more options
                      </p>
                    )}

                    {filteredBuckets.length === 0 && facetSearch[facetKey] && (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        No matches found
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
