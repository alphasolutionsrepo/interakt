'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Wrench,
  Plus,
  Search,
  RefreshCw,
  Activity,
  X,
  LayoutGrid,
  List,
  TrendingUp,
  MoreVertical,
  Eye,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  CircleCheck,
  CircleDashed,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { PageHeaderSkeleton, StatsCardsSkeleton, TableSkeleton } from '@/shared/ui/custom/skeletons';
import { DeleteConfirmDialog } from '@/shared/ui/custom/DeleteConfirmDialog';
import { ToolTypeChip, resolveToolChipConfig } from '../_components/ToolTypeChip';
import { useTools } from '../_lib/hooks/useTools';
import type { ToolWithUsage, ExecutorType } from '../_lib/api-client';

type ViewMode = 'cards' | 'table';

// ============================================================================
// GLOW CARD
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

// ============================================================================
// METRIC CARD
// ============================================================================

function MetricCard({
  label, value, icon, iconBg, trend, trendColor,
}: {
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
                  <TrendingUp className="mr-1 size-2.5" />
                  {trend}
                </Badge>
              )}
            </div>
          </div>
          <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
            {icon}
          </div>
        </div>
      </div>
    </GlowCard>
  );
}

// ============================================================================
// VIEW TOGGLE
// ============================================================================

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="inline-flex items-center rounded-xl bg-muted/50 p-1.5 border border-border/50">
      {(['table', 'cards'] as ViewMode[]).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${
            view === v ? 'bg-background text-foreground shadow-lg' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {v === 'table' ? <List className="size-4" /> : <LayoutGrid className="size-4" />}
          <span className="hidden sm:inline capitalize">{v === 'table' ? 'List' : 'Grid'}</span>
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// TOOL CARD
// ============================================================================

function ToolCard({ tool, onView, onEdit, onDelete }: {
  tool: ToolWithUsage;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const chipConfig = resolveToolChipConfig(tool);
  const Icon = chipConfig?.icon ?? Wrench;

  return (
    <GlowCard>
      <div onClick={onView} className="flex flex-col h-full p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="relative shrink-0">
              <div className={`flex size-12 items-center justify-center rounded-xl ${chipConfig?.iconBg ?? 'bg-muted'}`}>
                <Icon className={`size-6 ${chipConfig?.iconClass ?? 'text-muted-foreground'}`} />
              </div>
              {tool.isActive && (
                <div className="absolute -right-0.5 -bottom-0.5 size-4 rounded-full bg-emerald-500 ring-2 ring-background" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold tracking-tight truncate group-hover:text-primary transition-colors">
                {tool.name}
              </h3>
              <p className="text-sm text-muted-foreground font-mono truncate mt-0.5">{tool.slug}</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="size-9 shrink-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 rounded-xl">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(); }} className="rounded-lg py-2">
                <Eye className="size-4" /> View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }} className="rounded-lg py-2">
                <Edit2 className="size-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-destructive focus:text-destructive rounded-lg py-2">
                <Trash2 className="size-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4 min-h-[2.5rem]">
          {tool.description || '\u00A0'}
        </p>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <ToolTypeChip executorType={tool.executorType} operation={tool.operation} />
          {tool.isActive ? (
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 rounded-lg px-2.5 py-1 text-xs font-semibold">
              <CircleCheck className="mr-1.5 size-3.5" /> Active
            </Badge>
          ) : (
            <Badge variant="outline" className="rounded-lg px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              <CircleDashed className="mr-1.5 size-3.5" /> Inactive
            </Badge>
          )}
          {tool.isSystem && (
            <Badge variant="outline" className="rounded-lg px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              System
            </Badge>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 mt-auto border-t border-border/50">
          {tool.experienceCount !== undefined ? (
            <div className="text-sm text-muted-foreground font-medium">
              Used in <span className="font-bold text-foreground">{tool.experienceCount}</span>{' '}
              {tool.experienceCount === 1 ? 'experience' : 'experiences'}
            </div>
          ) : <div />}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{format(new Date(tool.createdAt), 'MMM d, yyyy')}</span>
            <ArrowUpRight className="size-4 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
          </div>
        </div>
      </div>
    </GlowCard>
  );
}

// ============================================================================
// TABLE VIEW
// ============================================================================

function TableView({ tools, onView, onEdit, onDelete, emptyAction }: {
  tools: ToolWithUsage[];
  onView: (t: ToolWithUsage) => void;
  onEdit: (t: ToolWithUsage) => void;
  onDelete: (t: ToolWithUsage) => void;
  emptyAction: React.ReactNode;
}) {
  if (tools.length === 0) {
    return (
      <GlowCard>
        <div className="flex flex-col items-center justify-center py-20 px-6">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-orange-500/10 ring-1 ring-orange-500/15 mb-6">
            <Wrench className="size-8 text-orange-500" />
          </div>
          <h3 className="text-2xl font-semibold tracking-tight">No tools yet</h3>
          <p className="mt-3 text-muted-foreground text-center max-w-md">
            Create your first tool to start building AI experiences.
          </p>
          <div className="mt-8">{emptyAction}</div>
        </div>
      </GlowCard>
    );
  }

  return (
    <GlowCard>
      <div className="overflow-hidden rounded-2xl">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              {['Tool', 'Type', 'Status', 'Experiences', 'Created', ''].map((h, i) => (
                <th key={i} className={`px-6 py-4 text-left text-xs font-semibold tracking-widest text-muted-foreground uppercase ${
                  i === 3 ? 'hidden lg:table-cell' : i === 4 ? 'hidden xl:table-cell' : ''
                }`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {tools.map((tool) => {
              const chipConfig = resolveToolChipConfig(tool);
              const Icon = chipConfig?.icon ?? Wrench;
              return (
                <tr
                  key={tool.id}
                  onClick={() => onView(tool)}
                  className="group cursor-pointer transition-colors hover:bg-muted/20"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3.5">
                      <div className="relative">
                        <div className={`flex size-10 items-center justify-center rounded-xl ${chipConfig?.iconBg ?? 'bg-muted'}`}>
                          <Icon className={`size-5 ${chipConfig?.iconClass ?? 'text-muted-foreground'}`} />
                        </div>
                        {tool.isActive && (
                          <div className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-emerald-500 ring-2 ring-background" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate group-hover:text-primary transition-colors">{tool.name}</p>
                        <p className="text-sm text-muted-foreground font-mono truncate">{tool.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <ToolTypeChip executorType={tool.executorType} operation={tool.operation} />
                  </td>
                  <td className="px-6 py-4">
                    {tool.isActive ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 rounded-lg px-2.5 py-1 text-xs font-semibold">
                        <CircleCheck className="mr-1.5 size-3.5" /> Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="rounded-lg px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                        <CircleDashed className="mr-1.5 size-3.5" /> Inactive
                      </Badge>
                    )}
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell">
                    <span className="text-lg font-bold tabular-nums">{tool.experienceCount ?? 0}</span>
                  </td>
                  <td className="px-6 py-4 hidden xl:table-cell text-muted-foreground font-medium">
                    {format(new Date(tool.createdAt), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-9 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 rounded-xl">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(tool); }} className="rounded-lg py-2">
                          <Eye className="size-4" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(tool); }} className="rounded-lg py-2">
                          <Edit2 className="size-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(tool); }} className="text-destructive focus:text-destructive rounded-lg py-2">
                          <Trash2 className="size-4" /> Delete
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
    </GlowCard>
  );
}

// ============================================================================
// PAGE
// ============================================================================

export default function ToolsPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [search, setSearch] = useState('');
  const [executorTypeFilter, setExecutorTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingTool, setDeletingTool] = useState<ToolWithUsage | null>(null);

  // Debounce search to avoid API call on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { tools, pagination, isLoading, isRefetching, isDeleting, deleteTool, refetch } = useTools({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    executorType: executorTypeFilter === 'all' ? undefined : (executorTypeFilter as ExecutorType),
    isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const totalItems = pagination?.totalItems ?? 0;
  const activeCount = tools.filter((t) => t.isActive).length;

  async function handleDelete() {
    if (!deletingTool) return;
    try {
      await deleteTool(deletingTool.id);
    } catch {
      // Error toast is shown by the mutation's onError handler
    } finally {
      setDeleteOpen(false);
      setDeletingTool(null);
    }
  }

  const hasFilters = search || executorTypeFilter !== 'all' || statusFilter !== 'all';

  const createButton = (
    <Button onClick={() => router.push('/tools/create')} size="lg" className="rounded-xl px-6 font-bold">
      <Plus className="mr-2 size-5" /> New Tool
    </Button>
  );

  if (isLoading && !tools.length) {
    return (
      <div className="flex-1 space-y-8 p-6 lg:p-8">
        <PageHeaderSkeleton showBreadcrumb={false} />
        <StatsCardsSkeleton count={4} columns={4} />
        <TableSkeleton rows={5} showSearch={false} />
      </div>
    );
  }

  // Count tools by executor type for stats
  const dataSourceCount = tools.filter((t) => t.executorType === 'data_source').length;
  const httpCount = tools.filter((t) => t.executorType === 'http').length;

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      <PageHeader
        variant="hero"
        title="Tools"
        description="Reusable capabilities (data source tools, HTTP APIs, MCP servers, AI responders) assigned to AI Experiences."
        icon={Wrench}
        iconBg="bg-orange-500/10"
        iconColor="text-orange-500"
        actions={createButton}
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total" value={totalItems} icon={<Wrench className="size-5 text-orange-500" />} iconBg="bg-orange-500/10" />
        <MetricCard
          label="Active"
          value={activeCount}
          icon={<Activity className="size-5 text-emerald-500" />}
          iconBg="bg-emerald-500/10"
          trend={totalItems > 0 ? `${Math.round((activeCount / totalItems) * 100)}%` : undefined}
          trendColor="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        />
        <MetricCard
          label="Data Source"
          value={dataSourceCount}
          icon={<Search className="size-5 text-blue-500" />}
          iconBg="bg-blue-500/10"
        />
        <MetricCard
          label="HTTP / Other"
          value={httpCount}
          icon={<Wrench className="size-5 text-teal-500" />}
          iconBg="bg-teal-500/10"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 lg:max-w-md">
            <Search className="absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search tools..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-12 rounded-xl pl-12 text-base border-border/50 font-medium"
            />
          </div>
          <Select value={executorTypeFilter} onValueChange={(v) => { setExecutorTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="h-12 w-[160px] rounded-xl border-border/50 bg-muted/30 font-bold">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="rounded-lg font-medium">All Types</SelectItem>
              <SelectItem value="data_source" className="rounded-lg font-medium">Data Source</SelectItem>
              <SelectItem value="http" className="rounded-lg font-medium">HTTP API</SelectItem>
              <SelectItem value="web_search" className="rounded-lg font-medium">Web Search</SelectItem>
              <SelectItem value="ai_call" className="rounded-lg font-medium">AI Responder</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="h-12 w-[140px] rounded-xl border-border/50 bg-muted/30 font-bold">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="rounded-lg font-medium">All Status</SelectItem>
              <SelectItem value="active" className="rounded-lg font-medium">Active</SelectItem>
              <SelectItem value="inactive" className="rounded-lg font-medium">Inactive</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="icon" onClick={() => { setSearch(''); setExecutorTypeFilter('all'); setStatusFilter('all'); setPage(1); }} className="size-12 rounded-xl">
              <X className="size-5" />
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isRefetching} className="size-12 rounded-xl border-border/50">
            <RefreshCw className={`size-5 ${isRefetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <ViewToggle view={viewMode} onChange={setViewMode} />
      </div>

      {/* Content */}
      {viewMode === 'cards' ? (
        tools.length === 0 ? (
          <GlowCard>
            <div className="flex flex-col items-center justify-center py-20 px-6">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-orange-500/10 ring-1 ring-orange-500/15 mb-6">
                <Wrench className="size-8 text-orange-500" />
              </div>
              <h3 className="text-2xl font-semibold tracking-tight">No tools yet</h3>
              <p className="mt-3 text-muted-foreground text-center max-w-md">
                Create your first tool to start building AI experiences.
              </p>
              <div className="mt-8">{createButton}</div>
            </div>
          </GlowCard>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {tools.map((tool) => (
              <ToolCard
                key={tool.id}
                tool={tool}
                onView={() => router.push(`/tools/${tool.id}`)}
                onEdit={() => router.push(`/tools/${tool.id}/edit`)}
                onDelete={() => { setDeletingTool(tool); setDeleteOpen(true); }}
              />
            ))}
          </div>
        )
      ) : (
        <TableView
          tools={tools}
          onView={(t) => router.push(`/tools/${t.id}`)}
          onEdit={(t) => router.push(`/tools/${t.id}/edit`)}
          onDelete={(t) => { setDeletingTool(t); setDeleteOpen(true); }}
          emptyAction={createButton}
        />
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-base text-muted-foreground font-medium">
            Showing{' '}
            <span className="font-bold tabular-nums text-foreground">{(page - 1) * pageSize + 1}</span>
            –<span className="font-bold tabular-nums text-foreground">{Math.min(page * pageSize, pagination.totalItems)}</span>{' '}
            of <span className="font-bold tabular-nums text-foreground">{pagination.totalItems}</span>
          </p>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setPage(page - 1)} disabled={page === 1} className="h-11 rounded-xl px-5 font-bold">
              <ChevronLeft className="mr-1 size-5" /> Previous
            </Button>
            <Button variant="outline" onClick={() => setPage(page + 1)} disabled={page >= pagination.totalPages} className="h-11 rounded-xl px-5 font-bold">
              Next <ChevronRight className="ml-1 size-5" />
            </Button>
          </div>
        </div>
      )}

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName={deletingTool?.name ?? ''}
        title="Delete Tool"
        description="This will permanently delete the tool. Any AI experiences using this tool will lose access to it."
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
