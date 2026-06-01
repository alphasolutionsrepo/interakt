'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bot, Plus, Search, RefreshCw, Activity, X,
  LayoutGrid, List, TrendingUp, MoreVertical,
  Eye, Edit2, Trash2, ChevronLeft, ChevronRight, ArrowUpRight,
  CircleCheck, CircleDashed, Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { PageHeaderSkeleton, StatsCardsSkeleton, TableSkeleton } from '@/shared/ui/custom/skeletons';
import { DeleteConfirmDialog } from '@/shared/ui/custom/DeleteConfirmDialog';
import { PipelineModeChip } from '@/app/ai-experiences/_components/PipelineModeChip';
import { useUnifiedExperiences, type UnifiedExperience } from '../_hooks/useUnifiedExperiences';

type ViewMode = 'cards' | 'table';
type TypeFilter = 'all' | 'ai' | 'search';

// ============================================================================
// SHARED UI COMPONENTS
// ============================================================================

function GlowCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`group relative cursor-pointer ${className}`}>
      <div className="relative rounded-2xl border border-border/60 bg-card shadow-sm transition-all duration-200 group-hover:shadow-md group-hover:border-border">
        {children}
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon, iconBg, trend, trendColor }: {
  label: string; value: number; icon: React.ReactNode; iconBg: string; trend?: string; trendColor?: string;
}) {
  return (
    <GlowCard>
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{label}</p>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <p className="text-3xl font-bold tracking-tight">{value}</p>
              {trend && (
                <Badge className={`${trendColor ?? 'bg-muted text-muted-foreground'} border-0 text-[10px] font-bold px-2 py-0.5`}>
                  <TrendingUp className="mr-1 size-2.5" />{trend}
                </Badge>
              )}
            </div>
          </div>
          <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>{icon}</div>
        </div>
      </div>
    </GlowCard>
  );
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="inline-flex items-center rounded-xl bg-muted/50 p-1.5 border border-border/50">
      {(['table', 'cards'] as ViewMode[]).map((v) => (
        <button key={v} onClick={() => onChange(v)}
          className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${view === v ? 'bg-background text-foreground shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}>
          {v === 'table' ? <List className="size-4" /> : <LayoutGrid className="size-4" />}
          <span className="hidden sm:inline">{v === 'table' ? 'List' : 'Grid'}</span>
        </button>
      ))}
    </div>
  );
}

function TypeTabs({ value, onChange }: { value: TypeFilter; onChange: (v: TypeFilter) => void }) {
  const tabs: { key: TypeFilter; label: string; icon: React.ElementType }[] = [
    { key: 'all', label: 'All', icon: Sparkles },
    { key: 'ai', label: 'AI', icon: Bot },
    { key: 'search', label: 'Search', icon: Search },
  ];
  return (
    <div className="inline-flex items-center rounded-xl bg-muted/50 p-1.5 border border-border/50">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button key={key} onClick={() => onChange(key)}
          className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${value === key ? 'bg-background text-foreground shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}>
          <Icon className="size-4" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// EXPERIENCE CARD (UNIFIED)
// ============================================================================

function ExperienceCard({ experience, onView, onEdit, onDelete }: {
  experience: UnifiedExperience;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isAI = experience._type === 'ai';

  return (
    <div className="group relative cursor-pointer" onClick={onView}>
      <div className="relative flex flex-col h-full rounded-xl border border-border/60 bg-card shadow-sm transition-all duration-200 group-hover:shadow-md group-hover:border-border overflow-hidden">
        {/* Top accent bar */}
        <div className={`h-1 w-full ${isAI ? 'bg-amber-500' : 'bg-teal-500'}`} />

        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-4 pb-2">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
            isAI ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-teal-50 dark:bg-teal-500/10'
          }`}>
            {isAI
              ? <Bot className="size-5 text-amber-600 dark:text-amber-400" />
              : <Search className="size-5 text-teal-600 dark:text-teal-400" />
            }
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm truncate">{experience.name}</h3>
            <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">{experience.slug}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 rounded-lg shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl w-44">
              <DropdownMenuItem className="rounded-lg" onClick={(e) => { e.stopPropagation(); onView(); }}>
                <Eye className="size-4 mr-2" />View Details
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-lg" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <Edit2 className="size-4 mr-2" />Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="rounded-lg text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                <Trash2 className="size-4 mr-2" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description */}
        <div className="px-5 min-h-[40px]">
          {experience.description ? (
            <p className="text-[13px] text-muted-foreground line-clamp-2 leading-relaxed">{experience.description}</p>
          ) : (
            <p className="text-[13px] text-muted-foreground/40 italic">No description</p>
          )}
        </div>

        {/* Badges */}
        <div className="mt-auto px-5 pt-3 pb-4 flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
            isAI
              ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30'
              : 'bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-500/30'
          }`}>
            {isAI ? 'AI' : 'Search'}
          </Badge>

          {experience.isActive ? (
            <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30">
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Inactive
            </Badge>
          )}

          {isAI && <PipelineModeChip mode={experience.pipelineMode} />}
          {isAI && experience.tools.length > 0 && (
            <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {experience.tools.length} tools
            </Badge>
          )}
          {!isAI && (
            <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {experience.indexCount} indexes
            </Badge>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/40 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">{format(new Date(experience.createdAt), 'MMM d, yyyy')}</span>
          <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TABLE VIEW (UNIFIED)
// ============================================================================

function DataTableView({ items, onView, onEdit, onDelete }: {
  items: UnifiedExperience[];
  onView: (e: UnifiedExperience) => void;
  onEdit: (e: UnifiedExperience) => void;
  onDelete: (e: UnifiedExperience) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30">
              {['Name', 'Type', 'Status', 'Details', 'Created', ''].map((h) => (
                <th key={h} className="text-left px-5 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((exp) => {
              const isAI = exp._type === 'ai';
              return (
                <tr key={`${exp._type}-${exp.id}`} onClick={() => onView(exp)}
                  className="border-b border-border/30 hover:bg-muted/20 transition-colors cursor-pointer group">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex size-9 items-center justify-center rounded-lg ${isAI ? 'bg-amber-500/10' : 'bg-teal-500/10'}`}>
                        {isAI ? <Bot className="size-4 text-amber-500" /> : <Search className="size-4 text-teal-600 dark:text-teal-400" />}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{exp.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{exp.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant="outline" className={`rounded-md text-[10px] font-semibold ${isAI ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30' : 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-500/30'}`}>
                      {isAI ? <Bot className="size-3 mr-1" /> : <Search className="size-3 mr-1" />}
                      {isAI ? 'AI' : 'Search'}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    {exp.isActive ? (
                      <Badge className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30 rounded-md text-[10px] font-semibold" variant="outline">
                        <CircleCheck className="size-3 mr-1" />Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="rounded-md text-[10px] font-semibold text-muted-foreground">
                        <CircleDashed className="size-3 mr-1" />Inactive
                      </Badge>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {isAI ? (
                      <div className="flex items-center gap-2">
                        <PipelineModeChip mode={exp.pipelineMode} />
                        <span className="text-xs text-muted-foreground">{exp.tools.length} tools</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{exp.indexCount} indexes</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">{format(new Date(exp.createdAt), 'MMM d, yyyy')}</td>
                  <td className="px-5 py-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8 rounded-lg" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl w-44">
                        <DropdownMenuItem className="rounded-lg" onClick={(e) => { e.stopPropagation(); onView(exp); }}>
                          <Eye className="size-4 mr-2" />View
                        </DropdownMenuItem>
                        <DropdownMenuItem className="rounded-lg" onClick={(e) => { e.stopPropagation(); onEdit(exp); }}>
                          <Edit2 className="size-4 mr-2" />Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="rounded-lg text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(exp); }}>
                          <Trash2 className="size-4 mr-2" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function ExperiencesPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 space-y-8 p-6 lg:p-8">
        <PageHeaderSkeleton />
        <StatsCardsSkeleton count={4} />
        <TableSkeleton />
      </div>
    }>
      <ExperiencesContent />
    </Suspense>
  );
}

function ExperiencesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType = (searchParams.get('type') as TypeFilter) || 'all';

  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(initialType);
  const [deleteTarget, setDeleteTarget] = useState<UnifiedExperience | null>(null);

  const isActiveParam = statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined;

  const {
    items, pagination, metrics, isLoading, isRefetching, refetch,
    deleteAIExperience, deleteSearchExperience, isDeletingAI, isDeletingSearch,
  } = useUnifiedExperiences({
    typeFilter,
    search: search || undefined,
    isActive: isActiveParam,
    page,
    pageSize,
  });

  const hasActiveFilters = search || statusFilter !== 'all';
  function clearFilters() { setSearch(''); setStatusFilter('all'); setPage(1); }

  function getExperiencePath(exp: UnifiedExperience) {
    return `/experiences/${exp._type}/${exp.id}`;
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    if (deleteTarget._type === 'ai') {
      await deleteAIExperience(deleteTarget.id);
    } else {
      await deleteSearchExperience(deleteTarget.id);
    }
    setDeleteTarget(null);
  }

  // Loading
  if (isLoading) {
    return (
      <div className="flex-1 space-y-8 p-6 lg:p-8">
        <PageHeaderSkeleton />
        <StatsCardsSkeleton count={4} />
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Header */}
      <PageHeader
        title="Experiences"
        description="Manage your AI and Search experiences in one place."
        customIcon={
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <Sparkles className="size-6 text-primary" />
          </div>
        }
        actions={
          <Button onClick={() => router.push('/experiences/create')} size="lg" className="rounded-xl px-6 font-bold">
            <Plus className="size-4 mr-2" />New Experience
          </Button>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total" value={metrics.total} icon={<Activity className="size-5 text-blue-500" />} iconBg="bg-blue-500/10" />
        <MetricCard label="Active" value={metrics.active} icon={<CircleCheck className="size-5 text-emerald-500" />} iconBg="bg-emerald-500/10"
          trend={metrics.total > 0 ? `${Math.round((metrics.active / metrics.total) * 100)}%` : undefined}
          trendColor="bg-emerald-500/10 text-emerald-600" />
        <MetricCard label="AI Experiences" value={metrics.aiCount} icon={<Bot className="size-5 text-amber-600" />} iconBg="bg-amber-50 dark:bg-amber-500/10" />
        <MetricCard label="Search Experiences" value={metrics.searchCount} icon={<Search className="size-5 text-teal-600" />} iconBg="bg-teal-500/10" />
      </div>

      {/* Type Tabs + Filters */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <TypeTabs value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} />
          <ViewToggle view={viewMode} onChange={setViewMode} />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name or slug…" className="pl-10 rounded-xl h-11" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="rounded-xl h-11 w-[140px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="rounded-lg">All Statuses</SelectItem>
              <SelectItem value="active" className="rounded-lg">Active</SelectItem>
              <SelectItem value="inactive" className="rounded-lg">Inactive</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground hover:text-foreground rounded-xl h-11">
              <X className="size-4 mr-1.5" />Clear
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={refetch} className="size-11 rounded-xl shrink-0" disabled={isRefetching}>
            <RefreshCw className={`size-4 ${isRefetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Content */}
      {items.length === 0 ? (
        <GlowCard className="mt-4">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
              <Sparkles className="size-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold">No experiences yet</h3>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">
              {hasActiveFilters ? 'Try adjusting your filters.' : 'Create your first AI or Search experience to get started.'}
            </p>
            {!hasActiveFilters && (
              <Button onClick={() => router.push('/experiences/create')} className="mt-6 rounded-xl">
                <Plus className="size-4 mr-2" />Create Experience
              </Button>
            )}
          </div>
        </GlowCard>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((exp) => (
            <ExperienceCard
              key={`${exp._type}-${exp.id}`}
              experience={exp}
              onView={() => router.push(getExperiencePath(exp))}
              onEdit={() => router.push(`${getExperiencePath(exp)}/edit`)}
              onDelete={() => setDeleteTarget(exp)}
            />
          ))}
        </div>
      ) : (
        <DataTableView
          items={items}
          onView={(e) => router.push(getExperiencePath(e))}
          onEdit={(e) => router.push(`${getExperiencePath(e)}/edit`)}
          onDelete={(e) => setDeleteTarget(e)}
        />
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.totalItems)} of {pagination.totalItems}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1} className="rounded-xl">
              <ChevronLeft className="size-4 mr-1" />Prev
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page === pagination.totalPages} className="rounded-xl">
              Next<ChevronRight className="size-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Delete ${deleteTarget?._type === 'ai' ? 'AI' : 'Search'} Experience`}
        itemName={deleteTarget?.name ?? ''}
        onConfirm={handleDelete}
        isLoading={isDeletingAI || isDeletingSearch}
      />
    </div>
  );
}
