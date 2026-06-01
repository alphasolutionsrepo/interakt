'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Database,
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
  HardDrive,
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
import { DataSourceTypeChip, DS_TYPE_CONFIG } from '../_components/DataSourceTypeChip';
import { HealthStatusChip } from '../_components/HealthStatusChip';
import { useDataSources } from '../_lib/hooks/useDataSources';
import type { DataSource, DataSourceType } from '../_lib/api-client';

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
// FORMAT STORAGE SIZE
// ============================================================================

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes === 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDocCount(count: number | null): string {
  if (count === null || count === undefined) return '-';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

// ============================================================================
// DATA SOURCE CARD
// ============================================================================

function DataSourceCard({ dataSource, onView, onEdit, onDelete }: {
  dataSource: DataSource;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cfg = DS_TYPE_CONFIG[dataSource.type as DataSourceType];
  const Icon = cfg?.icon ?? Database;

  return (
    <GlowCard>
      <div onClick={onView} className="flex flex-col h-full p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="relative shrink-0">
              <div className={`flex size-12 items-center justify-center rounded-xl ${cfg?.iconBg ?? 'bg-muted'}`}>
                <Icon className={`size-6 ${cfg?.iconClass ?? 'text-muted-foreground'}`} />
              </div>
              {dataSource.isActive && (
                <div className="absolute -right-0.5 -bottom-0.5 size-4 rounded-full bg-emerald-500 ring-2 ring-background" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold tracking-tight truncate group-hover:text-primary transition-colors">
                {dataSource.name}
              </h3>
              <p className="text-sm text-muted-foreground font-mono truncate mt-0.5">{dataSource.slug}</p>
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
          {dataSource.description || '\u00A0'}
        </p>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <DataSourceTypeChip type={dataSource.type} />
          <HealthStatusChip status={dataSource.status} />
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-5">
          {dataSource.documentCount !== null && (
            <span className="font-medium">
              <span className="font-bold text-foreground">{formatDocCount(dataSource.documentCount)}</span> docs
            </span>
          )}
          {dataSource.storageSizeBytes !== null && (
            <span className="font-medium">{formatBytes(dataSource.storageSizeBytes)}</span>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 mt-auto border-t border-border/50">
          {dataSource.isActive ? (
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 rounded-lg px-2.5 py-1 text-xs font-semibold">
              <CircleCheck className="mr-1.5 size-3.5" /> Active
            </Badge>
          ) : (
            <Badge variant="outline" className="rounded-lg px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              <CircleDashed className="mr-1.5 size-3.5" /> Inactive
            </Badge>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{format(new Date(dataSource.createdAt), 'MMM d, yyyy')}</span>
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

function TableView({ dataSources, onView, onEdit, onDelete, emptyAction }: {
  dataSources: DataSource[];
  onView: (d: DataSource) => void;
  onEdit: (d: DataSource) => void;
  onDelete: (d: DataSource) => void;
  emptyAction: React.ReactNode;
}) {
  if (dataSources.length === 0) {
    return (
      <GlowCard>
        <div className="flex flex-col items-center justify-center py-20 px-6">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-blue-500/10 ring-1 ring-blue-500/15 mb-6">
            <Database className="size-8 text-blue-500" />
          </div>
          <h3 className="text-2xl font-semibold tracking-tight">No data sources yet</h3>
          <p className="mt-3 text-muted-foreground text-center max-w-md">
            Connect your first data source to start building AI experiences.
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
              {['Data Source', 'Type', 'Health', 'Status', 'Documents', 'Created', ''].map((h, i) => (
                <th key={i} className={`px-6 py-4 text-left text-xs font-semibold tracking-widest text-muted-foreground uppercase ${
                  i === 4 ? 'hidden lg:table-cell' : i === 5 ? 'hidden xl:table-cell' : ''
                }`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {dataSources.map((ds) => {
              const cfg = DS_TYPE_CONFIG[ds.type as DataSourceType];
              const Icon = cfg?.icon ?? Database;
              return (
                <tr
                  key={ds.id}
                  onClick={() => onView(ds)}
                  className="group cursor-pointer transition-colors hover:bg-muted/20"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3.5">
                      <div className="relative">
                        <div className={`flex size-10 items-center justify-center rounded-xl ${cfg?.iconBg ?? 'bg-muted'}`}>
                          <Icon className={`size-5 ${cfg?.iconClass ?? 'text-muted-foreground'}`} />
                        </div>
                        {ds.isActive && (
                          <div className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-emerald-500 ring-2 ring-background" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate group-hover:text-primary transition-colors">{ds.name}</p>
                        <p className="text-sm text-muted-foreground font-mono truncate">{ds.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <DataSourceTypeChip type={ds.type} />
                  </td>
                  <td className="px-6 py-4">
                    <HealthStatusChip status={ds.status} />
                  </td>
                  <td className="px-6 py-4">
                    {ds.isActive ? (
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
                    <span className="text-lg font-bold tabular-nums">{formatDocCount(ds.documentCount)}</span>
                  </td>
                  <td className="px-6 py-4 hidden xl:table-cell text-muted-foreground font-medium">
                    {format(new Date(ds.createdAt), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-9 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 rounded-xl">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(ds); }} className="rounded-lg py-2">
                          <Eye className="size-4" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(ds); }} className="rounded-lg py-2">
                          <Edit2 className="size-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(ds); }} className="text-destructive focus:text-destructive rounded-lg py-2">
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

export default function DataSourcesPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingDs, setDeletingDs] = useState<DataSource | null>(null);

  const { dataSources, pagination, isLoading, isRefetching, isDeleting, deleteDataSource, refetch } = useDataSources({
    page,
    pageSize,
    search: search || undefined,
    type: typeFilter === 'all' ? undefined : (typeFilter as DataSourceType),
    isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const totalItems = pagination?.totalItems ?? 0;
  const activeCount = dataSources.filter((d) => d.isActive).length;
  const healthyCount = dataSources.filter((d) => d.status === 'healthy').length;
  const totalDocs = dataSources.reduce((acc, d) => acc + (d.documentCount ?? 0), 0);

  async function handleDelete() {
    if (!deletingDs) return;
    await deleteDataSource(deletingDs.id);
    setDeleteOpen(false);
    setDeletingDs(null);
  }

  const hasFilters = search || typeFilter !== 'all' || statusFilter !== 'all';

  const createButton = (
    <Button onClick={() => router.push('/data-sources/create')} size="lg" className="rounded-xl px-6 font-bold">
      <Plus className="mr-2 size-5" /> New Data Source
    </Button>
  );

  if (isLoading && !dataSources.length) {
    return (
      <div className="flex-1 space-y-8 p-6 lg:p-8">
        <PageHeaderSkeleton showBreadcrumb={false} />
        <StatsCardsSkeleton count={4} columns={4} />
        <TableSkeleton rows={5} showSearch={false} />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      <PageHeader
        variant="hero"
        title="Data Sources"
        description="Connect search indexes, file stores, databases, and external services as data sources for AI experiences."
        icon={Database}
        iconBg="bg-blue-500/10"
        iconColor="text-blue-500"
        actions={createButton}
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total"
          value={totalItems}
          icon={<Database className="size-5 text-blue-500" />}
          iconBg="bg-blue-500/10"
        />
        <MetricCard
          label="Active"
          value={activeCount}
          icon={<Activity className="size-5 text-emerald-500" />}
          iconBg="bg-emerald-500/10"
          trend={totalItems > 0 ? `${Math.round((activeCount / totalItems) * 100)}%` : undefined}
          trendColor="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        />
        <MetricCard
          label="Healthy"
          value={healthyCount}
          icon={<CircleCheck className="size-5 text-emerald-500" />}
          iconBg="bg-emerald-500/10"
          trend={totalItems > 0 ? `${Math.round((healthyCount / totalItems) * 100)}%` : undefined}
          trendColor="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        />
        <MetricCard
          label="Documents"
          value={totalDocs}
          icon={<HardDrive className="size-5 text-violet-500" />}
          iconBg="bg-violet-500/10"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 lg:max-w-md">
            <Search className="absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search data sources..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-12 rounded-xl pl-12 text-base border-border/50 font-medium"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
            <SelectTrigger className="h-12 w-[170px] rounded-xl border-border/50 bg-muted/30 font-bold">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="rounded-lg font-medium">All Types</SelectItem>
              <SelectItem value="search_index" className="rounded-lg font-medium">Search Index</SelectItem>
              <SelectItem value="search_index_external" className="rounded-lg font-medium">External Index</SelectItem>
              <SelectItem value="file_store" className="rounded-lg font-medium">File Store</SelectItem>
              <SelectItem value="database" className="rounded-lg font-medium">Database</SelectItem>
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
            <Button variant="ghost" size="icon" onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); setPage(1); }} className="size-12 rounded-xl">
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
        dataSources.length === 0 ? (
          <GlowCard>
            <div className="flex flex-col items-center justify-center py-20 px-6">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-blue-500/10 ring-1 ring-blue-500/15 mb-6">
                <Database className="size-8 text-blue-500" />
              </div>
              <h3 className="text-2xl font-semibold tracking-tight">No data sources yet</h3>
              <p className="mt-3 text-muted-foreground text-center max-w-md">
                Connect your first data source to start building AI experiences.
              </p>
              <div className="mt-8">{createButton}</div>
            </div>
          </GlowCard>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {dataSources.map((ds) => (
              <DataSourceCard
                key={ds.id}
                dataSource={ds}
                onView={() => router.push(`/data-sources/${ds.id}`)}
                onEdit={() => router.push(`/data-sources/${ds.id}/edit`)}
                onDelete={() => { setDeletingDs(ds); setDeleteOpen(true); }}
              />
            ))}
          </div>
        )
      ) : (
        <TableView
          dataSources={dataSources}
          onView={(d) => router.push(`/data-sources/${d.id}`)}
          onEdit={(d) => router.push(`/data-sources/${d.id}/edit`)}
          onDelete={(d) => { setDeletingDs(d); setDeleteOpen(true); }}
          emptyAction={createButton}
        />
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-base text-muted-foreground font-medium">
            Showing{' '}
            <span className="font-bold tabular-nums text-foreground">{(page - 1) * pageSize + 1}</span>
            {' '}&ndash;{' '}
            <span className="font-bold tabular-nums text-foreground">{Math.min(page * pageSize, pagination.totalItems)}</span>{' '}
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
        itemName={deletingDs?.name ?? ''}
        title="Delete Data Source"
        description="This will permanently delete the data source. Any AI experiences referencing this data source will lose access to it."
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
