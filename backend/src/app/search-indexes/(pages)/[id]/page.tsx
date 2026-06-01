// app/search-indexes/(pages)/[id]/page.tsx

'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronLeft,
  Edit2,
  Copy,
  Check,
  Database,
  Calendar,
  Hash,
  FileText,
  Brain,
  Zap,
  Settings,
  Clock,
  Languages,
  Power,
  PowerOff,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Activity,
  WifiOff,
  Server,
  Sparkles,
  Layers,
  ArrowRight,
  Upload,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useSearchIndex, useIndexStats, useSyncStatus } from '../../_lib/hooks/useSearchIndexes';
import { useFieldMappingSummary } from '../../_lib/hooks/useSearchIndexFields';
import { FieldMappingsCard } from '../../_components/FieldMappingsCard';
import { DeleteConfirmDialog } from '@/shared/ui/custom/DeleteConfirmDialog';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { ReindexDialog } from '../../_components/ReindexDialog';
import { ExportImportButtons } from '../../_components/ExportImportButtons';
import {
  SEARCH_TYPE_INFO,
  INDEXING_STRATEGY_INFO,
  VECTOR_SIMILARITY_INFO,
  type SearchType,
  type IndexStatus,
  type IndexingStrategy,
  type VectorSimilarity,
} from '@/features/search-index';
import { getProviderUI } from '../../_components/providers/provider-registry';
import '../../_components/providers'; // ensure all providers are registered

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
        ring: 'ring-blue-500/30',
      };
    case 'semantic':
      return {
        badge: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/25',
        icon: 'text-violet-500',
        iconBg: 'bg-violet-500/15',
        ring: 'ring-violet-500/30',
      };
    case 'hybrid':
      return {
        badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25',
        icon: 'text-amber-500',
        iconBg: 'bg-amber-500/15',
        ring: 'ring-amber-500/30',
      };
    default:
      return {
        badge: 'bg-muted text-muted-foreground border-border',
        icon: 'text-muted-foreground',
        iconBg: 'bg-muted/50',
        ring: 'ring-border/50',
      };
  }
}

function getStatusInfo(status: IndexStatus) {
  switch (status) {
    case 'ready':
      return {
        icon: <CheckCircle2 className="size-4" />,
        badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
        label: 'Ready',
      };
    case 'creating':
      return {
        icon: <Clock className="size-4" />,
        badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25',
        label: 'Creating',
      };
    case 'indexing':
      return {
        icon: <Activity className="size-4 animate-pulse" />,
        badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25',
        label: 'Indexing',
      };
    case 'error':
      return {
        icon: <AlertCircle className="size-4" />,
        badge: 'bg-destructive/15 text-destructive border-destructive/25',
        label: 'Error',
      };
    case 'offline':
      return {
        icon: <WifiOff className="size-4" />,
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

// ============================================================================
// COPY BUTTON COMPONENT
// ============================================================================

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(label ? `${label} copied` : 'Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2">
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

// ============================================================================
// SKELETON
// ============================================================================

function DetailPageSkeleton() {
  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Breadcrumb skeleton */}
      <Skeleton className="h-4 w-48 rounded-lg" />

      {/* Header skeleton */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Skeleton className="size-14 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64 rounded-lg" />
            <Skeleton className="h-4 w-48 rounded-lg" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-xl" />
          <Skeleton className="h-10 w-24 rounded-xl" />
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SearchIndexDetailPage() {
  const params = useParams();
  const router = useRouter();
  const indexId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reindexDialogOpen, setReindexDialogOpen] = useState(false);

  // Fetch data
  const {
    searchIndex,
    isLoading,
    deleteIndex,
    isDeleting,
    activateIndex,
    deactivateIndex,
    triggerReindex,
    recreateEmptyIndex,
    isActivating,
    isDeactivating,
    isReindexing,
    isRecreatingIndex,
  } = useSearchIndex(indexId);

  const { data: stats, isLoading: isLoadingStats } = useIndexStats(indexId, { enabled: !!searchIndex });
  const { data: syncStatus } = useSyncStatus(indexId, { enabled: !!searchIndex });

  // Field mapping summary
  const {
    data: fieldMappingSummary,
    isLoading: isLoadingMappingSummary
  } = useFieldMappingSummary(indexId);

  // Action handlers
  const handleDelete = async () => {
    await deleteIndex();
    router.push('/search-indexes');
  };

  const handleToggleActive = async () => {
    if (searchIndex?.isActive) {
      await deactivateIndex();
    } else {
      await activateIndex();
    }
  };

  const handleReindex = async () => {
    const result = await triggerReindex();
    return {
      documentCount: result.documentCount,
      durationMs: result.durationMs,
    };
  };

  if (isLoading) {
    return <DetailPageSkeleton />;
  }

  if (!searchIndex) {
    return (
      <div className="flex-1 p-6 lg:p-8">
        <div className="text-center py-16">
          <div className="flex size-20 items-center justify-center rounded-2xl bg-muted/50 mx-auto mb-6">
            <Database className="size-10 text-muted-foreground/50" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Search index not found</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            The search index you&apos;re looking for doesn&apos;t exist or has been deleted.
          </p>
          <Button variant="outline" className="mt-6 rounded-xl" onClick={() => router.push('/search-indexes')}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to list
          </Button>
        </div>
      </div>
    );
  }

  const typeInfo = SEARCH_TYPE_INFO[searchIndex.searchType as SearchType];
  const typeColors = getSearchTypeColor(searchIndex.searchType as SearchType);
  const statusInfo = getStatusInfo(searchIndex.status as IndexStatus);
  const strategyInfo = INDEXING_STRATEGY_INFO[searchIndex.indexingStrategy as IndexingStrategy];
  const similarityInfo = searchIndex.vectorSimilarity
    ? VECTOR_SIMILARITY_INFO[searchIndex.vectorSimilarity as VectorSimilarity]
    : null;

  const isAIEnabled = searchIndex.searchType === 'semantic' || searchIndex.searchType === 'hybrid';

  // Provider UI from registry (for label + SettingsDisplay)
  const providerUI = getProviderUI(searchIndex.searchProvider);
  const providerLabel = providerUI?.label ?? searchIndex.searchProvider ?? 'Unknown';

  // Merge deprecated top-level fields into providerSettings for backward compat
  const effectiveProviderSettings: Record<string, unknown> = {
    numberOfShards: searchIndex.numberOfShards,
    numberOfReplicas: searchIndex.numberOfReplicas,
    refreshInterval: searchIndex.refreshInterval,
    ...(searchIndex.providerSettings ?? {}),
  };

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Header */}
      <PageHeader
        variant="detail"
        title={searchIndex.displayName}
        description={searchIndex.description}
        breadcrumb={
          <nav className="flex items-center gap-2">
            <Link href="/search-indexes" className="hover:text-foreground transition-colors">
              Search Indexes
            </Link>
            <ChevronLeft className="h-4 w-4 rotate-180" />
            <span className="text-foreground font-medium">{searchIndex.displayName}</span>
          </nav>
        }
        customIcon={
          <div className="relative">
            <div className={`flex size-12 items-center justify-center rounded-xl shadow-sm ${
              searchIndex.isActive
                ? `bg-gradient-to-br ${typeColors.iconBg} ring-1 ${typeColors.ring}`
                : 'bg-muted/50 ring-1 ring-border/50'
            }`}>
              <span className={searchIndex.isActive ? typeColors.icon : 'text-muted-foreground'}>
                {getSearchTypeIcon(searchIndex.searchType as SearchType, 'size-6')}
              </span>
            </div>
            {searchIndex.isActive && searchIndex.status === 'ready' && (
              <div className="absolute -right-0.5 -bottom-0.5 flex items-center justify-center size-5 rounded-full bg-emerald-500 ring-2 ring-background">
                <Zap className="size-3 text-white fill-white" />
              </div>
            )}
          </div>
        }
        badge={
          <>
            <Badge className={`${statusInfo.badge} rounded-lg px-2.5 py-1 text-xs font-semibold flex items-center gap-1.5`}>
              {statusInfo.icon}
              {statusInfo.label}
            </Badge>
            <Badge variant="outline" className="rounded-lg px-2.5 py-1 text-xs font-semibold flex items-center gap-1.5">
              <Server className="h-3 w-3" />
              {providerLabel}
            </Badge>
            {!searchIndex.isActive && (
              <Badge variant="outline" className="rounded-lg px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                Inactive
              </Badge>
            )}
          </>
        }
        actions={
          <>
            <Button
              className="rounded-xl"
              onClick={() => router.push(`/search-indexes/${indexId}/upload`)}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
            <Button
              variant={searchIndex.isActive ? 'outline' : 'default'}
              className={`rounded-xl ${searchIndex.isActive ? '' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
              onClick={handleToggleActive}
              disabled={isActivating || isDeactivating}
            >
              {searchIndex.isActive ? (
                <>
                  <PowerOff className="h-4 w-4 mr-2" />
                  Deactivate
                </>
              ) : (
                <>
                  <Power className="h-4 w-4 mr-2" />
                  Activate
                </>
              )}
            </Button>
            <ExportImportButtons
              searchIndexId={indexId}
              searchIndexName={searchIndex.name}
              exportOnly
            />
            <Button variant="outline" className="rounded-xl" onClick={() => router.push(`/search-indexes/${indexId}/edit`)}>
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </>
        }
      />

      {/* Error Recovery Banner */}
      {searchIndex.status === 'error' && (
        <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm rounded-2xl">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
                <AlertCircle className="size-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-amber-900 dark:text-amber-200">
                  Index is in an error state
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  The search provider index may be missing or corrupted. You can recreate the empty index structure from your saved field definitions, then re-upload your documents.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-amber-500/30 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950/50 shrink-0"
                onClick={() => recreateEmptyIndex()}
                disabled={isRecreatingIndex}
              >
                {isRecreatingIndex ? (
                  <>
                    <RotateCcw className="h-3.5 w-3.5 mr-2 animate-spin" />
                    Recreating...
                  </>
                ) : (
                  <>
                    <Wrench className="h-3.5 w-3.5 mr-2" />
                    Recreate Index
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Documents</p>
                {isLoadingStats ? (
                  <Skeleton className="h-9 w-20 rounded-lg" />
                ) : (
                  <p className="text-3xl font-bold tracking-tight">
                    {formatNumber(stats?.documentCount ?? searchIndex.documentCount ?? 0)}
                  </p>
                )}
              </div>
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 shadow-sm">
                <FileText className="size-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Index Size</p>
                {isLoadingStats ? (
                  <Skeleton className="h-9 w-20 rounded-lg" />
                ) : (
                  <p className="text-3xl font-bold tracking-tight">
                    {formatBytes(stats?.indexSizeBytes ?? searchIndex.indexSizeBytes ?? 0)}
                  </p>
                )}
              </div>
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 shadow-sm">
                <Database className="size-6 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Fields</p>
                {isLoadingMappingSummary ? (
                  <Skeleton className="h-9 w-14 rounded-lg" />
                ) : (
                  <>
                    <p className="text-3xl font-bold tracking-tight">
                      {fieldMappingSummary?.totalFields ?? 0}
                    </p>
                    {fieldMappingSummary && (
                      <p className="text-xs text-muted-foreground">
                        {fieldMappingSummary.mappedFields} mapped
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 shadow-sm">
                <Layers className="size-6 text-violet-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Search Type</p>
                <Badge className={`${typeColors.badge} rounded-lg px-2.5 py-1.5 text-xs font-semibold mt-1`}>
                  {typeInfo?.label}
                </Badge>
              </div>
              <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${typeColors.iconBg} shadow-sm`}>
                <span className={typeColors.icon}>
                  {getSearchTypeIcon(searchIndex.searchType as SearchType, 'size-6')}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fields + Index Name row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Fields — takes 2/3 */}
        <div className="lg:col-span-2">
          <FieldMappingsCard
            searchIndexId={indexId}
            summary={fieldMappingSummary ?? null}
            isLoading={isLoadingMappingSummary}
          />
        </div>

        {/* Index Name + Reindex — takes 1/3 */}
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 font-semibold">
              <Database className="h-4 w-4 text-blue-500" />
              Index Name
            </CardTitle>
            <CardDescription className="mt-1.5">
              Technical name used by {providerLabel}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-xl font-mono text-sm border border-border/50">
              <code className="flex-1 text-foreground/80 truncate">{searchIndex.name}</code>
              <CopyButton text={searchIndex.name} label="Index name" />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full rounded-xl"
              onClick={() => setReindexDialogOpen(true)}
              disabled={isReindexing || searchIndex.status === 'indexing' || searchIndex.status === 'creating'}
            >
              <RotateCcw className={`h-3.5 w-3.5 mr-2 ${isReindexing ? 'animate-spin' : ''}`} />
              {isReindexing ? 'Reindexing...' : 'Reindex'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Detail Cards */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Index Information */}
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 font-semibold">
              <Settings className="h-4 w-4 text-blue-500" />
              Index Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Data Template */}
            <div className="p-3 bg-muted/30 rounded-xl">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Data Template</p>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge variant="secondary" className="rounded-lg">
                  {searchIndex.dataTemplate?.name || 'Unknown'}
                </Badge>
                {searchIndex.dataTemplate?.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/data-templates/${searchIndex.dataTemplate?.id}`)}
                    className="h-7 text-xs rounded-lg"
                  >
                    View
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            </div>

            {/* Timestamps */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-muted/30 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  Created
                </p>
                <p className="text-sm font-semibold mt-1">
                  {format(new Date(searchIndex.createdAt), 'MMM d, yyyy')}
                </p>
              </div>
              <div className="p-3 bg-muted/30 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1.5">
                  <RefreshCw className="h-3 w-3" />
                  Updated
                </p>
                <p className="text-sm font-semibold mt-1">
                  {format(new Date(searchIndex.updatedAt), 'MMM d, yyyy')}
                </p>
              </div>
            </div>

            {/* Last Indexed */}
            {searchIndex.lastIndexedAt && (
              <div className="p-3 bg-muted/30 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1.5">
                  <Activity className="h-3 w-3" />
                  Last Indexed
                </p>
                <p className="text-sm font-semibold mt-1">
                  {format(new Date(searchIndex.lastIndexedAt), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
            )}

            {/* Index ID */}
            <div className="p-3 bg-muted/30 rounded-xl">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1.5">
                <Hash className="h-3 w-3" />
                Index ID
              </p>
              <p className="text-xs font-mono text-foreground/80 mt-1 truncate">{searchIndex.id}</p>
            </div>
          </CardContent>
        </Card>

        {/* Search Settings */}
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 font-semibold">
              <Settings className="h-4 w-4 text-violet-500" />
              Search Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Indexing Strategy */}
            <div className="p-3 bg-muted/30 rounded-xl">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Indexing Strategy
              </p>
              <div className="mt-1.5">
                <Badge variant="outline" className="rounded-lg bg-background">
                  {strategyInfo?.label}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1.5">{strategyInfo?.description}</p>
              </div>
            </div>

            {/* Language */}
            <div className="p-3 bg-muted/30 rounded-xl">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1.5">
                <Languages className="h-3 w-3" />
                Language
              </p>
              <p className="text-sm font-semibold mt-1 capitalize">
                {searchIndex.language || 'English'}
              </p>
            </div>

            {/* Synonyms */}
            {searchIndex.synonyms && searchIndex.synonyms.length > 0 && (
              <div className="p-3 bg-muted/30 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Synonyms</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {searchIndex.synonyms.slice(0, 5).map((syn, i) => (
                    <Badge key={i} variant="secondary" className="text-xs rounded-lg">
                      {syn}
                    </Badge>
                  ))}
                  {searchIndex.synonyms.length > 5 && (
                    <Badge variant="outline" className="text-xs rounded-lg">
                      +{searchIndex.synonyms.length - 5} more
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Stop Words */}
            {searchIndex.stopWords && searchIndex.stopWords.length > 0 && (
              <div className="p-3 bg-muted/30 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Custom Stop Words</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {searchIndex.stopWords.slice(0, 10).map((word, i) => (
                    <Badge key={i} variant="outline" className="text-xs rounded-lg">
                      {word}
                    </Badge>
                  ))}
                  {searchIndex.stopWords.length > 10 && (
                    <Badge variant="outline" className="text-xs rounded-lg">
                      +{searchIndex.stopWords.length - 10} more
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Provider-specific settings */}
            {providerUI?.SettingsDisplay && (
              <providerUI.SettingsDisplay settings={effectiveProviderSettings} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Configuration (only if semantic/hybrid) */}
      {isAIEnabled && (
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 font-semibold">
              <Brain className="h-4 w-4 text-violet-500" />
              AI Configuration
            </CardTitle>
            <CardDescription>
              Embedding model and vector search settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-3 gap-4">
              {/* Provider */}
              <div className="p-4 bg-muted/30 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1.5">
                  <Server className="h-3 w-3" />
                  AI Provider
                </p>
                <div className="mt-2">
                  <Badge className="bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/25 rounded-lg">
                    <Sparkles className="h-3 w-3 mr-1" />
                    {searchIndex.aiProvider?.displayName || 'Not configured'}
                  </Badge>
                </div>
              </div>

              {/* Model */}
              <div className="p-4 bg-muted/30 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1.5">
                  <Brain className="h-3 w-3" />
                  Embedding Model
                </p>
                <div className="mt-2">
                  <Badge variant="secondary" className="rounded-lg">
                    {searchIndex.aiModel?.displayName || 'Not configured'}
                  </Badge>
                  {searchIndex.embeddingDimensions && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {searchIndex.embeddingDimensions} dimensions
                    </p>
                  )}
                </div>
              </div>

              {/* Vector Similarity */}
              <div className="p-4 bg-muted/30 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Vector Similarity</p>
                <div className="mt-2">
                  <Badge variant="outline" className="rounded-lg bg-background">
                    {similarityInfo?.label || searchIndex.vectorSimilarity || 'Cosine'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Note: Hybrid RRF Settings are now configured at Search Experience level */}
            {searchIndex.searchType === 'hybrid' && (
              <div className="mt-6 pt-6 border-t border-border/50">
                <p className="text-xs text-muted-foreground">
                  Hybrid search tuning (lexical/semantic weights, RRF parameters) is configured in your Search Experience settings.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Danger Zone */}
      <Card className="border-destructive/30 shadow-sm rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 font-semibold text-destructive">
            <Trash2 className="h-4 w-4" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible actions that permanently affect this search index
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-destructive/5 rounded-xl border border-destructive/20">
            <div>
              <p className="font-medium text-sm">Delete this search index</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                This will permanently delete the index, all field mappings, and remove it from {providerLabel}.
              </p>
            </div>
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={searchIndex.displayName}
        title="Delete Search Index"
        description={`This will permanently delete the "${searchIndex.displayName}" search index, all its field mappings, and remove the index from ${providerLabel}. This action cannot be undone.`}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />

      {/* Reindex Dialog */}
      <ReindexDialog
        open={reindexDialogOpen}
        onOpenChange={setReindexDialogOpen}
        indexName={searchIndex.name}
        currentDocumentCount={stats?.documentCount || searchIndex.documentCount || 0}
        onReindex={handleReindex}
      />
    </div>
  );
}
