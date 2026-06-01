// app/search-indexes/(pages)/page.tsx

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import {
  Plus,
  Search,
  RefreshCw,
  Eye,
  Edit2,
  Trash2,
  Database,
  ChevronLeft,
  ChevronRight,
  X,
  Zap,
  Brain,
  FileText,
  RotateCcw,
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  WifiOff,
  MoreVertical,
  TrendingUp,
  LayoutGrid,
  List,
  ArrowUpRight,
  Layers,
} from 'lucide-react';
import { format } from 'date-fns';
import { useSearchIndexes } from '../_lib/hooks/useSearchIndexes';
import { DeleteConfirmDialog } from '@/shared/ui/custom/DeleteConfirmDialog';
import { PageHeaderSkeleton, StatsCardsSkeleton, TableSkeleton } from '@/shared/ui/custom/skeletons';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { ExportImportButtons } from '../_components/ExportImportButtons';
import {
  SEARCH_TYPE_INFO,
  type SearchIndexSummary,
  type SearchType,
  type IndexStatus,
} from '@/features/search-index';

// ============================================================================
// TYPES
// ============================================================================

type ViewMode = 'table' | 'cards';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getSearchTypeIcon(type: SearchType, className = 'size-6') {
  switch (type) {
    case 'lexical':
      return <FileText className={className} />;
    case 'semantic':
      return <Brain className={className} />;
    case 'hybrid':
      return <Zap className={className} />;
    default:
      return <Database className={className} />;
  }
}

function getSearchTypeColor(type: SearchType) {
  switch (type) {
    case 'lexical':
      return {
        badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25',
        icon: 'text-blue-500',
        iconBg: 'bg-blue-500/15',
        gradient: 'from-blue-500/30 via-cyan-500/30 to-teal-500/30',
        ring: 'ring-blue-500/30',
      };
    case 'semantic':
      return {
        badge: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/25',
        icon: 'text-violet-500',
        iconBg: 'bg-violet-500/15',
        gradient: 'from-violet-500/30 via-purple-500/30 to-fuchsia-500/30',
        ring: 'ring-violet-500/30',
      };
    case 'hybrid':
      return {
        badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25',
        icon: 'text-amber-500',
        iconBg: 'bg-amber-500/15',
        gradient: 'from-amber-500/30 via-orange-500/30 to-red-500/30',
        ring: 'ring-amber-500/30',
      };
    default:
      return {
        badge: 'bg-muted text-muted-foreground border-border',
        icon: 'text-muted-foreground',
        iconBg: 'bg-muted/50',
        gradient: 'from-gray-500/10 via-gray-500/10 to-gray-500/10',
        ring: 'ring-border/50',
      };
  }
}

function getStatusInfo(status: IndexStatus) {
  switch (status) {
    case 'ready':
      return {
        icon: <CheckCircle2 className="size-3.5" />,
        badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
        label: 'Ready',
      };
    case 'creating':
      return {
        icon: <Clock className="size-3.5" />,
        badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25',
        label: 'Creating',
      };
    case 'indexing':
      return {
        icon: <Activity className="size-3.5 animate-pulse" />,
        badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25',
        label: 'Indexing',
      };
    case 'error':
      return {
        icon: <AlertCircle className="size-3.5" />,
        badge: 'bg-destructive/15 text-destructive border-destructive/25',
        label: 'Error',
      };
    case 'offline':
      return {
        icon: <WifiOff className="size-3.5" />,
        badge: 'bg-muted text-muted-foreground border-border',
        label: 'Offline',
      };
    default:
      return {
        icon: null,
        badge: 'bg-muted text-muted-foreground border-border',
        label: status,
      };
  }
}

function formatDocumentCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

// ============================================================================
// GLOW CARD - Card with hover glow effect
// ============================================================================

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}

function GlowCard({ children, className = '', glowColor = 'from-blue-500/20 via-purple-500/20 to-pink-500/20' }: GlowCardProps) {
  return (
    <div className={`group relative cursor-pointer ${className}`}>
      {/* Glow effect */}
      <div className={`absolute -inset-0.5 rounded-2xl bg-gradient-to-r ${glowColor} opacity-0 blur-xl transition-all duration-500 group-hover:opacity-100`} />
      {/* Card */}
      <div className="relative rounded-2xl border border-border/60 bg-card shadow-sm transition-shadow duration-300 group-hover:shadow-md">
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// METRIC CARD - Big bold numbers with glow
// ============================================================================

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  gradient: string;
  iconBg: string;
  trend?: string;
  trendColor?: string;
}

function MetricCard({ label, value, icon, gradient, iconBg, trend, trendColor }: MetricCardProps) {
  return (
    <GlowCard glowColor={gradient}>
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{label}</p>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <p className="text-3xl font-bold tracking-tight">
                {value}
              </p>
              {trend && (
                <Badge className={`${trendColor || 'bg-primary/10 text-primary'} border-0 text-[10px] font-bold px-2 py-0.5`}>
                  <TrendingUp className="mr-1 size-2.5" />
                  {trend}
                </Badge>
              )}
            </div>
          </div>
          <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${iconBg} shadow-sm`}>
            {icon}
          </div>
        </div>
      </div>
    </GlowCard>
  );
}

// ============================================================================
// STATS ROW
// ============================================================================

interface StatsRowProps {
  total: number;
  ready: number;
  totalDocuments: number;
}

function StatsRow({ total, ready, totalDocuments }: StatsRowProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard
        label="Total Indexes"
        value={total}
        icon={<Database className="size-6 text-blue-500" />}
        gradient="from-blue-500/30 via-cyan-500/30 to-teal-500/30"
        iconBg="bg-blue-500/15"
        trend={`+${total}`}
        trendColor="bg-blue-500/15 text-blue-600 dark:text-blue-400"
      />
      <MetricCard
        label="Ready"
        value={ready}
        icon={<CheckCircle2 className="size-6 text-emerald-500" />}
        gradient="from-emerald-500/30 via-green-500/30 to-teal-500/30"
        iconBg="bg-emerald-500/15"
        trend={total > 0 ? `${Math.round((ready / total) * 100)}%` : '0%'}
        trendColor="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      />
      <MetricCard
        label="Documents"
        value={formatDocumentCount(totalDocuments)}
        icon={<FileText className="size-6 text-violet-500" />}
        gradient="from-violet-500/30 via-purple-500/30 to-fuchsia-500/30"
        iconBg="bg-violet-500/15"
      />
    </div>
  );
}

// ============================================================================
// VIEW TOGGLE
// ============================================================================

interface ViewToggleProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="inline-flex items-center rounded-xl bg-muted/50 p-1.5 backdrop-blur-sm border border-border/50">
      <button
        onClick={() => onViewChange('table')}
        className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all duration-200 ${
          view === 'table'
            ? 'bg-background text-foreground shadow-lg'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <List className="size-4" />
        <span className="hidden sm:inline">List</span>
      </button>
      <button
        onClick={() => onViewChange('cards')}
        className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-all duration-200 ${
          view === 'cards'
            ? 'bg-background text-foreground shadow-lg'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <LayoutGrid className="size-4" />
        <span className="hidden sm:inline">Grid</span>
      </button>
    </div>
  );
}

// ============================================================================
// INDEX CARD
// ============================================================================

interface IndexCardProps {
  index: SearchIndexSummary;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function IndexCard({ index, onView, onEdit, onDelete }: IndexCardProps) {
  const typeColors = getSearchTypeColor(index.searchType as SearchType);
  const statusInfo = getStatusInfo(index.status as IndexStatus);
  const typeInfo = SEARCH_TYPE_INFO[index.searchType as SearchType];

  return (
    <GlowCard
      glowColor={index.isActive ? typeColors.gradient : 'from-gray-500/10 via-gray-500/10 to-gray-500/10'}
    >
      <div
        onClick={onView}
        className="p-6 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="relative shrink-0">
              <div className={`flex size-14 items-center justify-center rounded-xl shadow-sm ${
                index.isActive
                  ? `bg-gradient-to-br ${typeColors.iconBg} ring-1 ${typeColors.ring}`
                  : 'bg-muted/50 ring-1 ring-border/50'
              }`}>
                <span className={index.isActive ? typeColors.icon : 'text-muted-foreground'}>
                  {getSearchTypeIcon(index.searchType as SearchType)}
                </span>
              </div>
              {index.isActive && index.status === 'ready' && (
                <div className="absolute -right-0.5 -bottom-0.5 flex items-center justify-center size-5 rounded-full bg-emerald-500 ring-2 ring-background">
                  <Zap className="size-3 text-white fill-white" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-medium tracking-tight truncate group-hover:text-primary transition-colors">
                {index.displayName}
              </h3>
              <p className="text-sm text-muted-foreground font-mono truncate mt-1">
                {index.name}
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 rounded-xl">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(); }} className="rounded-lg py-2">
                <Eye className="size-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }} className="rounded-lg py-2">
                <Edit2 className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); }}
                className="rounded-lg py-2"
                disabled={index.status === 'indexing' || index.status === 'creating'}
              >
                <RotateCcw className="size-4" />
                Reindex
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="text-destructive focus:text-destructive rounded-lg py-2"
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <Badge className={`${statusInfo.badge} rounded-lg px-2.5 py-1 text-xs font-semibold`}>
            {statusInfo.icon}
            <span className="ml-1.5">{statusInfo.label}</span>
          </Badge>
          <Badge className={`${typeColors.badge} rounded-lg px-2.5 py-1 text-xs font-semibold`}>
            {typeInfo?.label || index.searchType}
          </Badge>
        </div>

        {/* Template */}
        {index.templateName && (
          <p className="text-sm text-muted-foreground mb-5 truncate">
            Template: <span className="font-medium text-foreground">{index.templateName}</span>
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-5 border-t border-border/50">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Layers className="size-4 text-muted-foreground" />
            <span className="tabular-nums">{formatDocumentCount(index.documentCount || 0)}</span>
            <span className="text-muted-foreground text-sm font-normal">docs</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
            <span>{format(new Date(index.createdAt), 'MMM d, yyyy')}</span>
            <ArrowUpRight className="size-4 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
          </div>
        </div>
      </div>
    </GlowCard>
  );
}

// ============================================================================
// CARDS GRID
// ============================================================================

interface CardsGridProps {
  indexes: SearchIndexSummary[];
  onView: (idx: SearchIndexSummary) => void;
  onEdit: (idx: SearchIndexSummary) => void;
  onDelete: (idx: SearchIndexSummary) => void;
  emptyAction: React.ReactNode;
}

function CardsGrid({ indexes, onView, onEdit, onDelete, emptyAction }: CardsGridProps) {
  if (indexes.length === 0) {
    return (
      <GlowCard className="w-full" glowColor="from-blue-500/20 via-purple-500/20 to-pink-500/20">
        <div className="flex flex-col items-center justify-center py-24 px-6">
          <div className="flex size-24 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500/20 via-blue-500/10 to-transparent ring-1 ring-blue-500/20 mb-8 shadow-sm">
            <Database className="size-12 text-blue-500" />
          </div>
          <h3 className="text-4xl font-semibold tracking-tight">No indexes yet</h3>
          <p className="mt-4 text-muted-foreground text-center max-w-md text-lg">
            Create your first search index to start indexing and searching your data.
          </p>
          <div className="mt-10">{emptyAction}</div>
        </div>
      </GlowCard>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {indexes.map((idx) => (
        <IndexCard
          key={idx.id}
          index={idx}
          onView={() => onView(idx)}
          onEdit={() => onEdit(idx)}
          onDelete={() => onDelete(idx)}
        />
      ))}
    </div>
  );
}

// ============================================================================
// DATA TABLE
// ============================================================================

interface DataTableProps {
  indexes: SearchIndexSummary[];
  onView: (idx: SearchIndexSummary) => void;
  onEdit: (idx: SearchIndexSummary) => void;
  onDelete: (idx: SearchIndexSummary) => void;
  emptyAction: React.ReactNode;
}

function DataTableView({ indexes, onView, onEdit, onDelete, emptyAction }: DataTableProps) {
  if (indexes.length === 0) {
    return (
      <GlowCard className="w-full" glowColor="from-blue-500/20 via-purple-500/20 to-pink-500/20">
        <div className="flex flex-col items-center justify-center py-24 px-6">
          <div className="flex size-24 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500/20 via-blue-500/10 to-transparent ring-1 ring-blue-500/20 mb-8 shadow-sm">
            <Database className="size-12 text-blue-500" />
          </div>
          <h3 className="text-4xl font-semibold tracking-tight">No indexes yet</h3>
          <p className="mt-4 text-muted-foreground text-center max-w-md text-lg">
            Create your first search index to get started.
          </p>
          <div className="mt-10">{emptyAction}</div>
        </div>
      </GlowCard>
    );
  }

  return (
    <GlowCard glowColor="from-blue-500/10 via-purple-500/10 to-pink-500/10">
      <div className="overflow-hidden rounded-2xl">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="px-6 py-5 text-left text-xs font-bold tracking-widest text-muted-foreground uppercase">
                Index
              </th>
              <th className="px-6 py-5 text-left text-xs font-bold tracking-widest text-muted-foreground uppercase">
                Type
              </th>
              <th className="px-6 py-5 text-left text-xs font-bold tracking-widest text-muted-foreground uppercase">
                Status
              </th>
              <th className="px-6 py-5 text-left text-xs font-bold tracking-widest text-muted-foreground uppercase hidden md:table-cell">
                Template
              </th>
              <th className="px-6 py-5 text-left text-xs font-bold tracking-widest text-muted-foreground uppercase hidden lg:table-cell">
                Documents
              </th>
              <th className="px-6 py-5 text-left text-xs font-bold tracking-widest text-muted-foreground uppercase hidden xl:table-cell">
                Created
              </th>
              <th className="px-6 py-5 w-14"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {indexes.map((idx) => {
              const typeColors = getSearchTypeColor(idx.searchType as SearchType);
              const statusInfo = getStatusInfo(idx.status as IndexStatus);
              const typeInfo = SEARCH_TYPE_INFO[idx.searchType as SearchType];

              return (
                <tr
                  key={idx.id}
                  onClick={() => onView(idx)}
                  className="group relative cursor-pointer transition-all duration-300 hover:bg-gradient-to-r hover:from-primary/5 hover:via-primary/3 hover:to-transparent"
                >
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className={`flex size-12 items-center justify-center rounded-xl shadow-sm ${
                          idx.isActive
                            ? `bg-gradient-to-br ${typeColors.iconBg} ring-1 ${typeColors.ring}`
                            : 'bg-muted/50 ring-1 ring-border/50'
                        }`}>
                          <span className={idx.isActive ? typeColors.icon : 'text-muted-foreground'}>
                            {getSearchTypeIcon(idx.searchType as SearchType, 'size-5')}
                          </span>
                        </div>
                        {idx.isActive && idx.status === 'ready' && (
                          <div className="absolute -right-0.5 -bottom-0.5 flex items-center justify-center size-4 rounded-full bg-emerald-500 ring-2 ring-background">
                            <Zap className="size-2.5 text-white fill-white" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-lg font-medium truncate group-hover:text-primary transition-colors">
                          {idx.displayName}
                        </p>
                        <p className="text-sm text-muted-foreground font-mono truncate">
                          {idx.name}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <Badge className={`${typeColors.badge} rounded-lg px-3 py-1.5 text-xs font-bold`}>
                      {typeInfo?.label || idx.searchType}
                    </Badge>
                  </td>
                  <td className="px-6 py-5">
                    <Badge className={`${statusInfo.badge} rounded-lg px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 w-fit`}>
                      {statusInfo.icon}
                      {statusInfo.label}
                    </Badge>
                  </td>
                  <td className="px-6 py-5 hidden md:table-cell">
                    <span className="text-muted-foreground font-medium">
                      {idx.templateName || '—'}
                    </span>
                  </td>
                  <td className="px-6 py-5 hidden lg:table-cell">
                    <span className="text-lg font-bold tabular-nums">{formatDocumentCount(idx.documentCount || 0)}</span>
                  </td>
                  <td className="px-6 py-5 hidden xl:table-cell text-muted-foreground font-medium">
                    {format(new Date(idx.createdAt), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="size-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 rounded-xl">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(idx); }} className="rounded-lg py-2.5">
                          <Eye className="size-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(idx); }} className="rounded-lg py-2.5">
                          <Edit2 className="size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); }}
                          className="rounded-lg py-2.5"
                          disabled={idx.status === 'indexing' || idx.status === 'creating'}
                        >
                          <RotateCcw className="size-4" />
                          Reindex
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); onDelete(idx); }}
                          className="text-destructive focus:text-destructive rounded-lg py-2.5"
                        >
                          <Trash2 className="size-4" />
                          Delete
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
// MAIN COMPONENT
// ============================================================================

export default function SearchIndexesListPage() {
  const router = useRouter();

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('cards');

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<IndexStatus | 'all'>('all');
  const [searchTypeFilter, setSearchTypeFilter] = useState<SearchType | 'all'>('all');
  const pageSize = 12;

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [indexToDelete, setIndexToDelete] = useState<SearchIndexSummary | null>(null);

  // Fetch data
  const {
    indexes,
    pagination,
    isLoading,
    isDeleting,
    deleteIndex,
    refetch,
    isRefetching,
  } = useSearchIndexes({
    page,
    pageSize,
    search: searchQuery || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    searchType: searchTypeFilter !== 'all' ? searchTypeFilter : undefined,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  });

  // Calculate stats
  const stats = {
    total: pagination?.totalItems || 0,
    ready: indexes.filter(i => i.status === 'ready').length,
    totalDocuments: indexes.reduce((sum, i) => sum + (i.documentCount || 0), 0),
  };

  // Handlers
  const handleClearFilters = () => {
    setStatusFilter('all');
    setSearchTypeFilter('all');
    setSearchQuery('');
    setPage(1);
  };

  const handleDeleteClick = (index: SearchIndexSummary) => {
    setIndexToDelete(index);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (indexToDelete) {
      await deleteIndex(indexToDelete.id);
      setDeleteDialogOpen(false);
      setIndexToDelete(null);
    }
  };

  const hasFilters = statusFilter !== 'all' || searchTypeFilter !== 'all' || searchQuery.trim().length > 0;

  const createButton = (
    <Button
      onClick={() => router.push('/search-indexes/create')}
      size="lg"
      className="rounded-xl px-6 font-bold text-base shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all"
    >
      <Plus className="mr-2 size-5" />
      New Index
    </Button>
  );

  // Loading state
  if (isLoading && !indexes.length) {
    return (
      <div className="flex-1 space-y-8 p-6 lg:p-8">
        <PageHeaderSkeleton showBreadcrumb={false} />
        <StatsCardsSkeleton count={3} columns={3} />
        <TableSkeleton rows={5} showSearch={false} />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Page Header */}
      <PageHeader
        variant="hero"
        title="Search Indexes"
        description="Manage your Azure Cognitive Search indexes, field mappings, and document ingestion."
        icon={Database}
        iconBg="bg-emerald-500/10"
        iconColor="text-emerald-500"
        actions={
          <>
            <ExportImportButtons importOnly />
            {createButton}
          </>
        }
      />

      {/* Metrics */}
      <StatsRow {...stats} />

      {/* Toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 items-center gap-3 flex-wrap">
          <div className="relative flex-1 lg:max-w-md">
            <Search className="absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search indexes..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="h-12 rounded-xl pl-12 text-base border-border/50 bg-background/60 focus-visible:bg-background font-medium"
            />
          </div>
          <Select
            value={searchTypeFilter}
            onValueChange={(value) => {
              setSearchTypeFilter(value as SearchType | 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className="h-12 w-[140px] rounded-xl border-border/50 bg-muted/30 backdrop-blur-sm font-bold">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="rounded-lg font-medium">All Types</SelectItem>
              <SelectItem value="lexical" className="rounded-lg font-medium">Lexical</SelectItem>
              <SelectItem value="semantic" className="rounded-lg font-medium">Semantic</SelectItem>
              <SelectItem value="hybrid" className="rounded-lg font-medium">Hybrid</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as IndexStatus | 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className="h-12 w-[140px] rounded-xl border-border/50 bg-muted/30 backdrop-blur-sm font-bold">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="rounded-lg font-medium">All Status</SelectItem>
              <SelectItem value="ready" className="rounded-lg font-medium">Ready</SelectItem>
              <SelectItem value="creating" className="rounded-lg font-medium">Creating</SelectItem>
              <SelectItem value="indexing" className="rounded-lg font-medium">Indexing</SelectItem>
              <SelectItem value="error" className="rounded-lg font-medium">Error</SelectItem>
              <SelectItem value="offline" className="rounded-lg font-medium">Offline</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearFilters}
              className="size-12 rounded-xl"
            >
              <X className="size-5" />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="size-12 rounded-xl border-border/50"
          >
            <RefreshCw className={`size-5 ${isRefetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <ViewToggle view={viewMode} onViewChange={setViewMode} />
      </div>

      {/* Content */}
      {viewMode === 'cards' ? (
        <CardsGrid
          indexes={indexes}
          onView={(idx) => router.push(`/search-indexes/${idx.id}`)}
          onEdit={(idx) => router.push(`/search-indexes/${idx.id}/edit`)}
          onDelete={handleDeleteClick}
          emptyAction={createButton}
        />
      ) : (
        <DataTableView
          indexes={indexes}
          onView={(idx) => router.push(`/search-indexes/${idx.id}`)}
          onEdit={(idx) => router.push(`/search-indexes/${idx.id}/edit`)}
          onDelete={handleDeleteClick}
          emptyAction={createButton}
        />
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-base text-muted-foreground font-medium">
            Showing <span className="font-bold tabular-nums text-foreground">{(page - 1) * pageSize + 1}</span>
            –<span className="font-bold tabular-nums text-foreground">{Math.min(page * pageSize, pagination.totalItems)}</span> of{' '}
            <span className="font-bold tabular-nums text-foreground">{pagination.totalItems}</span>
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="h-11 rounded-xl px-5 font-bold"
            >
              <ChevronLeft className="mr-1 size-5" />
              Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => setPage(page + 1)}
              disabled={page >= pagination.totalPages}
              className="h-11 rounded-xl px-5 font-bold"
            >
              Next
              <ChevronRight className="ml-1 size-5" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={indexToDelete?.displayName}
        title="Delete Search Index"
        description={`This will permanently delete the "${indexToDelete?.displayName}" search index, all its field mappings, and remove the index from Azure Search. This action cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
      />
    </div>
  );
}
