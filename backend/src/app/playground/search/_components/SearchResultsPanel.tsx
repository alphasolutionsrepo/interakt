// app/playground/search/_components/SearchResultsPanel.tsx

'use client';

/**
 * Search Results Panel
 *
 * Displays search results with hits, facets, and pagination.
 * Uses plain overflow-y-auto (not Radix ScrollArea) so cards are width-
 * constrained to the viewport — prevents highlight text and JSON from
 * overflowing to the right.
 */

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    AlertCircle,
    ChevronRight,
    ChevronLeft,
    Clock,
    Hash,
    Search,
    Star,
    X,
    Info,
    ChevronDown,
    Sparkles,
    FileText,
    Copy,
    Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import type {
    SearchResponse,
    SearchHit,
    FacetResult,
    FilterClause,
} from '../_lib/hooks/useSearchPlayground';

// ============================================================================
// PROPS
// ============================================================================

interface SearchResultsPanelProps {
    result: SearchResponse | null;
    error: string | null;
    isSearching: boolean;
    onPageChange: (page: number) => void;
    onFacetSelect?: (field: string, value: string | number) => void;
    onFacetDeselect?: (field: string, value: string | number) => void;
    activeFilters?: FilterClause[];
}

// ============================================================================
// COPY BUTTON
// ============================================================================

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => {
                navigator.clipboard.writeText(text).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            }}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
            {copied ? (
                <><Check className="h-3 w-3 text-green-500" />Copied</>
            ) : (
                <><Copy className="h-3 w-3" />Copy</>
            )}
        </button>
    );
}

// ============================================================================
// MAIN PANEL
// ============================================================================

export function SearchResultsPanel({
    result,
    error,
    isSearching,
    onPageChange,
    onFacetSelect,
    onFacetDeselect,
    activeFilters = [],
}: SearchResultsPanelProps) {
    const [expandedHits, setExpandedHits] = useState<Set<string>>(new Set());
    const [showDebugInfo, setShowDebugInfo] = useState(false);

    const toggleExpanded = (id: string) => {
        setExpandedHits(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // Loading state
    if (isSearching) {
        return (
            <div className="h-full p-4 space-y-2.5">
                <div className="flex items-center gap-4 mb-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" />
                </div>
                {[1, 2, 3].map(i => (
                    <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-2/3" />
                    </div>
                ))}
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="h-full flex items-center justify-center p-8">
                <Card className="max-w-md w-full p-6">
                    <div className="flex flex-col items-center text-center gap-4">
                        <div className="p-3 rounded-full bg-destructive/10">
                            <AlertCircle className="h-6 w-6 text-destructive" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg">Search Failed</h3>
                            <p className="text-sm text-muted-foreground mt-1">{error}</p>
                        </div>
                    </div>
                </Card>
            </div>
        );
    }

    // Empty / waiting state
    if (!result) {
        return (
            <div className="h-full flex items-center justify-center p-8">
                <div className="flex flex-col items-center text-center gap-4 max-w-sm">
                    <div className="p-4 rounded-full bg-muted border border-border/50">
                        <Search className="h-7 w-7 text-muted-foreground/50" />
                    </div>
                    <div className="space-y-1.5">
                        <h2 className="text-lg font-semibold text-foreground">Enter a query to get started</h2>
                        <p className="text-sm text-muted-foreground">
                            Run raw queries directly against a search index.
                        </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                        <Badge variant="outline" className="font-normal text-xs">Keyword · Semantic · Hybrid</Badge>
                        <Badge variant="outline" className="font-normal text-xs">Filters &amp; facets</Badge>
                        <Badge variant="outline" className="font-normal text-xs">Sort &amp; paginate</Badge>
                    </div>
                </div>
            </div>
        );
    }

    // No results
    if (result.hits.length === 0) {
        return (
            <div className="h-full flex items-center justify-center p-8">
                <div className="flex flex-col items-center text-center gap-5 max-w-md">
                    <div className="relative p-5 rounded-full bg-amber-500/10 border border-amber-500/20">
                        <Search className="h-10 w-10 text-amber-500/60" />
                        <X className="absolute -bottom-1 -right-1 h-5 w-5 text-amber-600 bg-background rounded-full p-0.5" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold tracking-tight text-foreground/80">No Matches Found</h2>
                        <p className="text-muted-foreground">
                            Try different keywords or remove some filters.
                        </p>
                    </div>
                    {activeFilters.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                            <span className="font-medium">{activeFilters.length} filter{activeFilters.length !== 1 ? 's' : ''}</span> currently active
                        </p>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {result.took}ms
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">

            {/* ── Results header ── */}
            <div className="shrink-0 px-4 py-2.5 border-b bg-muted/20 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="secondary" className="gap-1">
                        <Hash className="h-3 w-3" />
                        {result.total.value.toLocaleString()}
                        {result.total.relation === 'gte' && '+'} results
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                        <Clock className="h-3 w-3" />
                        {result.took}ms
                    </Badge>
                    {result.maxScore !== undefined && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Badge variant="outline" className="gap-1 cursor-help">
                                        <Star className="h-3 w-3" />
                                        {result.maxScore.toFixed(3)}
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Max relevance score</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    {result.explanation && (
                        <button
                            onClick={() => setShowDebugInfo(v => !v)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
                        >
                            <Info className="h-3 w-3" />
                            Debug
                            <ChevronDown className={cn('h-3 w-3 transition-transform duration-150', showDebugInfo && 'rotate-180')} />
                        </button>
                    )}
                </div>

                {/* Pagination */}
                {result.pagination.totalPages > 1 && (
                    <div className="flex items-center gap-1 shrink-0">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => onPageChange(result.pagination.page - 1)}
                            disabled={!result.pagination.hasPreviousPage}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground px-2 whitespace-nowrap">
                            {result.pagination.page} / {result.pagination.totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => onPageChange(result.pagination.page + 1)}
                            disabled={!result.pagination.hasNextPage}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </div>

            {/* Debug info */}
            {result.explanation && showDebugInfo && (
                <div className="shrink-0 px-4 py-2.5 border-b text-xs font-mono bg-muted/40 space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Type:</span>
                        <Badge variant="outline" className="text-[10px]">{result.explanation.searchType}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Fields:</span>
                        <span className="text-foreground/70">{result.explanation.searchedFields.join(', ')}</span>
                    </div>
                    {result.explanation.appliedFilters.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Filters:</span>
                            <span className="text-foreground/70">{result.explanation.appliedFilters.join(', ')}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Facet chips */}
            {result.facets && result.facets.length > 0 && (
                <div className="shrink-0 border-b px-4 py-3 bg-background">
                    <div className="flex flex-wrap gap-2">
                        {result.facets.map(facet => (
                            <FacetChipGroup
                                key={facet.field}
                                facet={facet}
                                activeFilters={activeFilters}
                                onSelect={onFacetSelect}
                                onDeselect={onFacetDeselect}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Scrollable hits — plain div, NOT ScrollArea ── */}
            <div className="flex-1 overflow-y-auto min-h-0">
                <div className="p-4 space-y-2">
                    {result.hits.map((hit, index) => (
                        <HitCard
                            key={hit.id || `hit-${index}`}
                            hit={hit}
                            isExpanded={expandedHits.has(hit.id)}
                            onToggleExpand={() => toggleExpanded(hit.id)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// FACET CHIP GROUP
// ============================================================================

interface FacetChipGroupProps {
    facet: FacetResult;
    activeFilters: FilterClause[];
    onSelect?: (field: string, value: string | number) => void;
    onDeselect?: (field: string, value: string | number) => void;
}

function FacetChipGroup({ facet, activeFilters, onSelect, onDeselect }: FacetChipGroupProps) {
    const isActive = (value: string | number) =>
        activeFilters.some(f => f.field === facet.field && f.value === value);

    if (!facet.buckets || facet.buckets.length === 0) return null;

    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground mr-1">{facet.field}:</span>
            {facet.buckets.slice(0, 6).map(bucket => {
                const active = isActive(bucket.key);
                const label = bucket.label || String(bucket.key);
                return (
                    <TooltipProvider key={String(bucket.key)} delayDuration={400}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <label className={cn(
                                    'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs cursor-pointer transition-all duration-150 select-none',
                                    active
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                                )}>
                                    <Checkbox
                                        checked={active}
                                        onCheckedChange={checked => {
                                            if (checked) onSelect?.(facet.field, bucket.key);
                                            else onDeselect?.(facet.field, bucket.key);
                                        }}
                                        className="h-3 w-3 border-current data-[state=checked]:bg-transparent data-[state=checked]:text-current"
                                    />
                                    <span className="truncate max-w-[100px]">{label}</span>
                                    <span className={cn('font-mono text-[10px]', active ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                                        {bucket.count}
                                    </span>
                                </label>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                                <p>{active ? 'Click to remove filter' : `Filter by "${label}"`}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                );
            })}
            {facet.buckets.length > 6 && (
                <span className="text-[10px] text-muted-foreground">+{facet.buckets.length - 6}</span>
            )}
        </div>
    );
}

// ============================================================================
// HIT CARD — no Radix Collapsible, plain conditional render
// ============================================================================

interface HitCardProps {
    hit: SearchHit;
    isExpanded: boolean;
    onToggleExpand: () => void;
}

function HitCard({ hit, isExpanded, onToggleExpand }: HitCardProps) {
    const title = String(hit.source.title || hit.source.name || hit.source.displayName || hit.id);
    const description = hit.source.description || hit.source.content || hit.source.body;
    const highlights = hit.highlights || {};
    const hasHighlights = Object.keys(highlights).length > 0;
    const json = JSON.stringify(hit.source, null, 2);

    return (
        <div className="rounded-lg border bg-card text-card-foreground overflow-hidden">

            {/* ── Header — always visible, acts as toggle ── */}
            <button
                onClick={onToggleExpand}
                className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-muted/40 transition-colors"
            >
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                            {hit.score.toFixed(4)}
                        </Badge>
                        <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-40">
                            {hit.id}
                        </code>
                        {hasHighlights && !isExpanded && (
                            <span className="text-xs text-amber-600 flex items-center gap-0.5">
                                <Sparkles className="h-3 w-3 shrink-0" />
                                {Object.keys(highlights).length}
                            </span>
                        )}
                    </div>
                    <p className="text-sm font-semibold leading-snug truncate">{title}</p>
                    {!isExpanded && description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                            {String(description).slice(0, 220)}
                            {String(description).length > 220 ? '…' : ''}
                        </p>
                    )}
                </div>
                <ChevronRight
                    className={cn(
                        'h-4 w-4 text-muted-foreground transition-transform duration-150 shrink-0 mt-0.5',
                        isExpanded && 'rotate-90'
                    )}
                />
            </button>

            {/* ── Expanded detail ── */}
            {isExpanded && (
                <div className="border-t divide-y">

                    {/* Highlights */}
                    {hasHighlights && (
                        <div className="px-4 py-3.5 space-y-3 bg-amber-50/40 dark:bg-amber-950/10">
                            <h5 className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles className="h-3 w-3" />
                                Highlights
                            </h5>
                            <div className="space-y-2.5">
                                {Object.entries(highlights).map(([field, fragments]) => (
                                    <div key={field}>
                                        <p className="text-[11px] font-medium text-muted-foreground mb-1">{field}</p>
                                        {/* overflow-wrap ensures long tokens wrap rather than clip */}
                                        <div
                                            className="text-sm bg-background px-3 py-2 rounded-md border leading-relaxed wrap-break-word [&_mark]:bg-yellow-200 [&_mark]:dark:bg-yellow-900/60 [&_mark]:text-yellow-900 [&_mark]:dark:text-yellow-200 [&_mark]:px-0.5 [&_mark]:rounded-sm"
                                            dangerouslySetInnerHTML={{
                                                __html: Array.isArray(fragments)
                                                    ? fragments.join(' … ')
                                                    : String(fragments),
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* All Fields — JSON with horizontal scroll + copy */}
                    <div className="px-4 py-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                            <h5 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <FileText className="h-3 w-3" />
                                All Fields
                            </h5>
                            <CopyButton text={json} />
                        </div>
                        {/* overflow-x-auto wrapper owns the fixed-width scroll region.
                            pre uses w-max so it's exactly content-wide and scrolls inside it. */}
                        <div className="rounded-md border bg-muted/30 overflow-x-auto">
                            <pre className="text-xs px-3 py-3 leading-relaxed font-mono text-foreground w-max min-w-full">
                                {json}
                            </pre>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}
