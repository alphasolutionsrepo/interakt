// app/playground/search/_components/SearchPlayground.tsx

'use client';

/**
 * Search Playground
 *
 * Layout: compact header (title + index selector + search bar + options strip),
 * left sidebar (index info + filters + sort + facets), right results panel.
 */

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Search,
    AlertCircle,
    RefreshCw,
    ChevronDown,
    Hash,
    Sparkles,
    Zap,
    Database,
    FileSearch,
    Layers,
    FileText,
    Filter,
    BarChart3,
    ArrowUpDown,
    SlidersHorizontal,
    X,
} from 'lucide-react';

import {
    useSearchIndexes,
    useSearchContext,
    useSearch,
    usePlaygroundState,
} from '../_lib/hooks/useSearchPlayground';
import { SearchResultsPanel } from './SearchResultsPanel';
import { FilterBuilder } from './FilterBuilder';
import { FacetBuilder } from './FacetBuilder';
import { SortBuilder } from './SortBuilder';
import { InternalAutocompleteInput } from './InternalAutocompleteInput';

// ============================================================================
// SIDEBAR SECTION — flat collapsible (no nested Cards)
// ============================================================================

function SidebarSection({
    icon,
    title,
    count,
    defaultOpen = false,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    count?: number;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    return (
        <Collapsible defaultOpen={defaultOpen}>
            <CollapsibleTrigger className="group flex w-full items-center justify-between px-3 py-2.5 text-xs font-medium hover:bg-muted/50 transition-colors">
                <span className="flex items-center gap-2">
                    {icon}
                    {title}
                    {(count ?? 0) > 0 && (
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{count}</Badge>
                    )}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="px-3 pb-3 pt-1">
                    {children}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SearchPlayground({ hideHeader = false }: { hideHeader?: boolean } = {}) {
    const { indexes, isLoading: isLoadingIndexes, error: indexesError, refetch: refetchIndexes } = useSearchIndexes();
    const playgroundState = usePlaygroundState();
    const [autocompleteEnabled, setAutocompleteEnabled] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { context, isLoading: isLoadingContext } = useSearchContext(playgroundState.selectedIndex);
    const { isSearching, searchResult, searchError, executeSearch, clearResults } = useSearch();

    const hasActiveIndex = useMemo(() => indexes.some(i => i.isActive), [indexes]);
    const isPendingAutoSelection = !isLoadingIndexes && !playgroundState.selectedIndex && hasActiveIndex;

    // Auto-select first active index
    useEffect(() => {
        if (indexes.length > 0 && !playgroundState.selectedIndex) {
            const activeIndex = indexes.find(i => i.isActive);
            if (activeIndex) playgroundState.setSelectedIndex(activeIndex.id);
        }
    }, [indexes, playgroundState.selectedIndex]);

    const selectedIndexInfo = useMemo(
        () => indexes.find(i => i.id === playgroundState.selectedIndex),
        [indexes, playgroundState.selectedIndex]
    );

    const handleSearch = async () => {
        if (!playgroundState.selectedIndex || !playgroundState.query.trim()) return;
        await executeSearch(playgroundState.selectedIndex, playgroundState.buildRequest());
    };

    const handleFacetSelect = (field: string, value: string | number) => {
        if (!playgroundState.filters.some(f => f.field === field && f.value === value)) {
            playgroundState.setFilters([...playgroundState.filters, { field, operator: 'eq', value }]);
            if (playgroundState.query.trim()) setTimeout(handleSearch, 100);
        }
    };

    const handleFacetDeselect = (field: string, value: string | number) => {
        playgroundState.setFilters(playgroundState.filters.filter(f => !(f.field === field && f.value === value)));
        if (playgroundState.query.trim()) setTimeout(handleSearch, 100);
    };

    // Error state
    if (indexesError) {
        return (
            <div className="h-full flex items-center justify-center p-8">
                <div className="flex flex-col items-center text-center gap-4 max-w-sm">
                    <div className="p-3 rounded-full bg-destructive/10">
                        <AlertCircle className="h-6 w-6 text-destructive" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-lg">Failed to load search indexes</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            Please check that you have created search indexes.
                        </p>
                    </div>
                    <Button onClick={() => refetchIndexes()} variant="outline" className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Try Again
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">

            {/* ── Header ── */}
            <header className="shrink-0 border-b bg-background">

                {/* Title + index selector row */}
                <div className="flex items-center gap-4 px-6 py-4 lg:px-8">
                    {!hideHeader && (
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="p-3 rounded-xl bg-linear-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20 shadow-sm shrink-0">
                            <Database className="size-7 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="space-y-1">
                            <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">Index Search</h1>
                            <p className="text-sm text-muted-foreground max-w-2xl">Test search queries directly against a raw search index.</p>
                        </div>
                    </div>
                    )}
                    {hideHeader && <div className="flex-1" />}

                    {isLoadingIndexes ? (
                        <Skeleton className="h-9 w-80 shrink-0" />
                    ) : indexes.length === 0 ? (
                        <span className="text-sm text-muted-foreground">No indexes available</span>
                    ) : (
                        <Select
                            value={playgroundState.selectedIndex || ''}
                            onValueChange={(v) => {
                                playgroundState.setSelectedIndex(v);
                                clearResults();
                            }}
                        >
                            <SelectTrigger className="h-9 w-80 shrink-0">
                                <SelectValue placeholder="Select a search index" />
                            </SelectTrigger>
                            <SelectContent>
                                {indexes.map((index) => (
                                    <SelectItem key={index.id} value={index.id}>
                                        <div className="flex items-center gap-2">
                                            <Database className="h-3.5 w-3.5 text-muted-foreground" />
                                            <span>{index.displayName || index.name}</span>
                                            <Badge
                                                variant={index.status === 'active' ? 'default' : 'secondary'}
                                                className="text-[10px] px-1.5 py-0 ml-1"
                                            >
                                                {index.searchType}
                                            </Badge>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>

                {/* Search bar + options strip */}
                {playgroundState.selectedIndex && (
                    <div className="px-4 pb-3 space-y-2">

                        {/* Search row */}
                        <div className="flex items-center gap-2">
                            {/* Sidebar toggle */}
                            {(() => {
                                const count = playgroundState.filters.length + playgroundState.sort.length + playgroundState.facets.length;
                                return (
                                    <Button
                                        variant={sidebarOpen ? 'secondary' : 'outline'}
                                        size="sm"
                                        className="h-10 gap-1.5 shrink-0 font-normal"
                                        onClick={() => setSidebarOpen(v => !v)}
                                    >
                                        <SlidersHorizontal className="h-4 w-4" />
                                        {count > 0 ? (
                                            <Badge className="h-4 px-1.5 text-[10px] ml-0.5">{count}</Badge>
                                        ) : (
                                            <span className="text-xs hidden sm:inline">Filters</span>
                                        )}
                                    </Button>
                                );
                            })()}
                            <div className="flex-1 min-w-0">
                                <InternalAutocompleteInput
                                    indexId={playgroundState.selectedIndex}
                                    enabled={autocompleteEnabled}
                                    placeholder="Enter your search query…"
                                    initialQuery={playgroundState.query}
                                    onQueryChange={playgroundState.setQuery}
                                    onSearch={(q) => {
                                        playgroundState.setQuery(q);
                                        handleSearch();
                                    }}
                                    onSuggestionSelect={(s) => playgroundState.setQuery(s.text)}
                                    inputClassName="h-10"
                                    showTiming={true}
                                />
                            </div>
                            <Select
                                value={playgroundState.searchType}
                                onValueChange={(v) => playgroundState.setSearchType(v as 'lexical' | 'semantic' | 'hybrid' | 'auto')}
                            >
                                <SelectTrigger className="h-10 w-[110px] shrink-0">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto">
                                        <div className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" />Auto</div>
                                    </SelectItem>
                                    <SelectItem value="lexical">
                                        <div className="flex items-center gap-2"><FileSearch className="h-3.5 w-3.5" />Lexical</div>
                                    </SelectItem>
                                    <SelectItem value="semantic">
                                        <div className="flex items-center gap-2"><Zap className="h-3.5 w-3.5" />Semantic</div>
                                    </SelectItem>
                                    <SelectItem value="hybrid">
                                        <div className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" />Hybrid</div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <Button
                                onClick={handleSearch}
                                disabled={!playgroundState.query.trim() || isSearching}
                                className="h-10 px-4 shrink-0"
                            >
                                {isSearching
                                    ? <RefreshCw className="h-4 w-4 animate-spin" />
                                    : <Search className="h-4 w-4" />
                                }
                            </Button>
                        </div>

                        {/* Options strip */}
                        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
                            <div className="flex items-center gap-1.5">
                                <Switch
                                    id="ac-sp"
                                    checked={autocompleteEnabled}
                                    onCheckedChange={setAutocompleteEnabled}
                                    className="scale-75 origin-left"
                                />
                                <Label htmlFor="ac-sp" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                                    Autocomplete
                                </Label>
                            </div>

                            <Separator orientation="vertical" className="h-3.5 hidden sm:block" />

                            <div className="flex items-center gap-1.5">
                                <Switch
                                    id="hl-sp"
                                    checked={playgroundState.enableHighlight}
                                    onCheckedChange={playgroundState.setEnableHighlight}
                                    className="scale-75 origin-left"
                                />
                                <Label htmlFor="hl-sp" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                                    Highlight
                                </Label>
                            </div>

                            <div className="flex items-center gap-1.5">
                                <Switch
                                    id="dbg-sp"
                                    checked={playgroundState.enableExplain}
                                    onCheckedChange={playgroundState.setEnableExplain}
                                    className="scale-75 origin-left"
                                />
                                <Label htmlFor="dbg-sp" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                                    Debug
                                </Label>
                            </div>

                            <Separator orientation="vertical" className="h-3.5 hidden sm:block" />

                            <div className="flex items-center gap-1.5">
                                <Label htmlFor="ps-sp" className="text-xs text-muted-foreground whitespace-nowrap">Per page</Label>
                                <Select
                                    value={playgroundState.pageSize.toString()}
                                    onValueChange={(v) => playgroundState.setPageSize(parseInt(v))}
                                >
                                    <SelectTrigger id="ps-sp" className="h-6 w-14 text-xs px-2">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="10">10</SelectItem>
                                        <SelectItem value="20">20</SelectItem>
                                        <SelectItem value="50">50</SelectItem>
                                        <SelectItem value="100">100</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                )}
            </header>

            {/* ── Main ── */}
            <main className="flex-1 min-h-0 overflow-hidden">
                {/* Loading skeleton */}
                {(isLoadingIndexes || isPendingAutoSelection) ? (
                    <div className="h-full flex">
                        <div className="w-72 border-r p-3 space-y-2 shrink-0">
                            <Skeleton className="h-24 w-full rounded-lg" />
                            <Skeleton className="h-10 w-full rounded-lg" />
                            <Skeleton className="h-10 w-full rounded-lg" />
                            <Skeleton className="h-10 w-full rounded-lg" />
                        </div>
                        <div className="flex-1 p-6 space-y-3">
                            <Skeleton className="h-8 w-48" />
                            <Skeleton className="h-20 w-full rounded-lg" />
                            <Skeleton className="h-20 w-full rounded-lg" />
                            <Skeleton className="h-20 w-full rounded-lg" />
                        </div>
                    </div>
                ) : !playgroundState.selectedIndex ? (
                    <div className="h-full flex items-center justify-center p-12">
                        {indexes.length === 0 ? (
                            <div className="max-w-3xl w-full">
                                <div className="flex flex-col items-center text-center">
                                    <div className="relative mb-10">
                                        <div className="absolute inset-0 rounded-3xl bg-linear-to-br from-blue-500/15 via-cyan-500/10 to-transparent blur-xl opacity-60" />
                                        <div className="relative flex size-32 items-center justify-center rounded-3xl bg-linear-to-br from-background/80 to-muted/50 ring-1 ring-border/50 shadow-2xl">
                                            <Database className="size-16 text-blue-500" />
                                        </div>
                                    </div>
                                    <h2 className="text-5xl font-semibold tracking-tight mb-5">No Search Indexes Yet</h2>
                                    <p className="text-xl text-muted-foreground mb-12 max-w-2xl">
                                        Create your first search index to start testing search queries with filters, facets, and highlighting
                                    </p>
                                    <Button size="lg" className="h-14 px-8 gap-2 text-base font-bold shadow-lg" asChild>
                                        <a href="/search-indexes">
                                            <Database className="size-5" />
                                            Create Search Index
                                        </a>
                                    </Button>
                                    <div className="grid gap-6 md:grid-cols-3 mt-16 w-full">
                                        <div className="flex flex-col items-center text-center p-6 rounded-2xl border border-border/60 bg-card/50">
                                            <div className="mb-4 p-3 rounded-xl bg-blue-500/15 shadow-sm ring-1 ring-border/30">
                                                <FileSearch className="size-7 text-blue-600 dark:text-blue-400" />
                                            </div>
                                            <h3 className="font-bold text-lg mb-2">Lexical Search</h3>
                                            <p className="text-sm text-muted-foreground">Keyword-based matching with BM25 ranking</p>
                                        </div>
                                        <div className="flex flex-col items-center text-center p-6 rounded-2xl border border-border/60 bg-card/50">
                                            <div className="mb-4 p-3 rounded-xl bg-purple-500/15 shadow-sm ring-1 ring-border/30">
                                                <Zap className="size-7 text-purple-600 dark:text-purple-400" />
                                            </div>
                                            <h3 className="font-bold text-lg mb-2">Semantic Search</h3>
                                            <p className="text-sm text-muted-foreground">AI-powered vector similarity search</p>
                                        </div>
                                        <div className="flex flex-col items-center text-center p-6 rounded-2xl border border-border/60 bg-card/50">
                                            <div className="mb-4 p-3 rounded-xl bg-amber-500/15 shadow-sm ring-1 ring-border/30">
                                                <Sparkles className="size-7 text-amber-600 dark:text-amber-400" />
                                            </div>
                                            <h3 className="font-bold text-lg mb-2">Hybrid Search</h3>
                                            <p className="text-sm text-muted-foreground">Best of both lexical and semantic</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="max-w-lg w-full">
                                <div className="flex flex-col items-center text-center">
                                    <div className="relative mb-8">
                                        <div className="absolute inset-0 rounded-3xl bg-linear-to-br from-blue-500/15 via-cyan-500/10 to-transparent blur-xl opacity-60" />
                                        <div className="relative flex size-24 items-center justify-center rounded-3xl bg-linear-to-br from-background/80 to-muted/50 ring-1 ring-border/50 shadow-2xl">
                                            <Search className="size-12 text-blue-500" />
                                        </div>
                                    </div>
                                    <h2 className="text-3xl font-semibold tracking-tight mb-3">Select a Search Index</h2>
                                    <p className="text-base text-muted-foreground">
                                        Choose an index from the dropdown above to start testing
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="h-full flex overflow-hidden">

                        {/* ── Left sidebar — toggleable ── */}
                        {sidebarOpen && (
                        <div className="w-72 border-r flex flex-col overflow-hidden shrink-0">

                            {/* Index info — always-visible compact header */}
                            {selectedIndexInfo && (
                                <div className="shrink-0 px-3 py-3 border-b bg-muted/20 space-y-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 w-5 p-0 shrink-0 -ml-0.5 text-muted-foreground hover:text-foreground"
                                            onClick={() => setSidebarOpen(false)}
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                        <Database className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                        <span className="text-xs font-semibold truncate flex-1">
                                            {selectedIndexInfo.displayName || selectedIndexInfo.name}
                                        </span>
                                        <Badge
                                            variant={selectedIndexInfo.status === 'active' ? 'default' : 'secondary'}
                                            className="text-[10px] shrink-0"
                                        >
                                            {selectedIndexInfo.status}
                                        </Badge>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                                        <span className="text-muted-foreground flex items-center gap-1">
                                            <Layers className="h-3 w-3" />Type
                                        </span>
                                        <span className="text-right font-mono">{selectedIndexInfo.searchType}</span>
                                        <span className="text-muted-foreground flex items-center gap-1">
                                            <Hash className="h-3 w-3" />Docs
                                        </span>
                                        <span className="text-right font-mono">
                                            {selectedIndexInfo.documentCount?.toLocaleString() || '0'}
                                        </span>
                                        {selectedIndexInfo.dataTemplateName && (
                                            <>
                                                <span className="text-muted-foreground flex items-center gap-1">
                                                    <FileText className="h-3 w-3" />Template
                                                </span>
                                                <span className="text-right truncate">
                                                    {selectedIndexInfo.dataTemplateName}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Collapsible sections — plain overflow-y-auto, no ScrollArea */}
                            <div className="flex-1 overflow-y-auto min-h-0 divide-y">
                                <SidebarSection
                                    icon={<Filter className="h-3.5 w-3.5" />}
                                    title="Filters"
                                    count={playgroundState.filters.length}
                                >
                                    <FilterBuilder
                                        filters={playgroundState.filters}
                                        onFiltersChange={playgroundState.setFilters}
                                        context={context}
                                        isLoading={isLoadingContext}
                                    />
                                </SidebarSection>

                                <SidebarSection
                                    icon={<ArrowUpDown className="h-3.5 w-3.5" />}
                                    title="Sort"
                                    count={playgroundState.sort.length}
                                >
                                    <SortBuilder
                                        sorts={playgroundState.sort}
                                        onSortsChange={playgroundState.setSort}
                                    />
                                </SidebarSection>

                                <SidebarSection
                                    icon={<BarChart3 className="h-3.5 w-3.5" />}
                                    title="Facets"
                                    count={playgroundState.facets.length}
                                >
                                    <FacetBuilder
                                        facets={playgroundState.facets}
                                        onFacetsChange={playgroundState.setFacets}
                                        context={context}
                                        isLoading={isLoadingContext}
                                    />
                                </SidebarSection>
                            </div>
                        </div>
                        )}

                        {/* ── Results panel ── */}
                        <div className="flex-1 min-w-0 overflow-hidden">
                            <SearchResultsPanel
                                result={searchResult}
                                error={searchError}
                                isSearching={isSearching}
                                onPageChange={(page) => {
                                    playgroundState.setPage(page);
                                    handleSearch();
                                }}
                                onFacetSelect={handleFacetSelect}
                                onFacetDeselect={handleFacetDeselect}
                                activeFilters={playgroundState.filters}
                            />
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
