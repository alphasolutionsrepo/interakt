// app/search-indexes/(pages)/[id]/upload/page.tsx

/**
 * Document Upload Page
 *
 * Upload documents to index in Elasticsearch
 */

'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronLeft,
  Database,
  Upload,
  History,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  FileText,
  Brain,
  Braces,
  Search,
  Zap,
  Layers,
} from 'lucide-react';
import { format } from 'date-fns';
import { useSearchIndex } from '../../../_lib/hooks/useSearchIndexes';
import { useIndexingBatches } from '../../../_lib/hooks/useDocumentIndexing';
import { DocumentUploadPanel } from '../../../_components/DocumentUpload';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

type SearchType = 'lexical' | 'semantic' | 'hybrid';

type SearchTypeColors = {
  iconBg: string;
  ring: string;
  icon: string;
  badge: string;
};

// ============================================================================
// HELPERS
// ============================================================================

function getSearchTypeColor(type: SearchType): SearchTypeColors {
  switch (type) {
    case 'lexical':
      return {
        iconBg: 'from-blue-500/20 via-blue-500/10 to-transparent',
        ring: 'ring-blue-500/30',
        icon: 'text-blue-500',
        badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
      };
    case 'semantic':
      return {
        iconBg: 'from-violet-500/20 via-violet-500/10 to-transparent',
        ring: 'ring-violet-500/30',
        icon: 'text-violet-500',
        badge: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
      };
    case 'hybrid':
      return {
        iconBg: 'from-amber-500/20 via-amber-500/10 to-transparent',
        ring: 'ring-amber-500/30',
        icon: 'text-amber-500',
        badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
      };
    default:
      return {
        iconBg: 'from-muted/50 via-muted/30 to-transparent',
        ring: 'ring-border/50',
        icon: 'text-muted-foreground',
        badge: 'bg-muted text-muted-foreground',
      };
  }
}

function getSearchTypeIcon(type: SearchType, className: string = 'size-5') {
  switch (type) {
    case 'lexical':
      return <FileText className={className} />;
    case 'semantic':
      return <Brain className={className} />;
    case 'hybrid':
      return <Braces className={className} />;
    default:
      return <Search className={className} />;
  }
}

// ============================================================================
// SKELETON
// ============================================================================

function PageSkeleton() {
  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Breadcrumb skeleton */}
      <Skeleton className="h-4 w-48 rounded-lg" />

      {/* Header skeleton */}
      <div className="flex items-start gap-4">
        <Skeleton className="size-14 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="h-4 w-48 rounded-lg" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// BATCH HISTORY
// ============================================================================

function BatchHistory({ searchIndexId }: { searchIndexId: string }) {
  const { data: batches, isLoading } = useIndexingBatches(searchIndexId, { limit: 5 });

  const statusConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string; label: string }> = {
    pending: { icon: Clock, color: 'text-muted-foreground', bgColor: 'bg-muted/50', label: 'Pending' },
    processing: { icon: Loader2, color: 'text-blue-500', bgColor: 'bg-blue-500/15', label: 'Processing' },
    completed: { icon: CheckCircle2, color: 'text-emerald-500', bgColor: 'bg-emerald-500/15', label: 'Completed' },
    failed: { icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-500/15', label: 'Failed' },
    cancelled: { icon: AlertCircle, color: 'text-amber-500', bgColor: 'bg-amber-500/15', label: 'Cancelled' },
  };

  if (isLoading) {
    return (
      <Card className="border-border/60 shadow-sm rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 font-semibold">
            <History className="h-4 w-4 text-muted-foreground" />
            Recent Uploads
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!batches || batches.length === 0) {
    return (
      <Card className="border-border/60 shadow-sm rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 font-semibold">
            <History className="h-4 w-4 text-muted-foreground" />
            Recent Uploads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="flex size-12 items-center justify-center rounded-xl bg-muted/50 mx-auto mb-3">
              <Upload className="size-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">No uploads yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Upload documents to see history here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 shadow-sm rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 font-semibold">
          <History className="h-4 w-4 text-muted-foreground" />
          Recent Uploads
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {batches.map((batch) => {
          const config = statusConfig[batch.status] || statusConfig.pending;
          const Icon = config.icon;
          const progress = batch.totalDocuments > 0
            ? Math.round((batch.indexedDocuments / batch.totalDocuments) * 100)
            : 0;

          return (
            <div
              key={batch.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors"
            >
              <div className={cn('size-9 rounded-lg flex items-center justify-center', config.bgColor)}>
                <Icon className={cn('size-4', config.color, batch.status === 'processing' && 'animate-spin')} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">
                    {batch.sourceFileName || 'Manual upload'}
                  </p>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] px-1.5 py-0 rounded-md capitalize font-medium',
                      batch.status === 'completed' && 'text-emerald-600 border-emerald-300',
                      batch.status === 'processing' && 'text-blue-600 border-blue-300',
                      batch.status === 'failed' && 'text-red-600 border-red-300',
                      batch.status === 'pending' && 'text-muted-foreground border-border',
                    )}
                  >
                    {config.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold tabular-nums">{batch.indexedDocuments}</span>
                    <span className="text-muted-foreground/70">/{batch.totalDocuments} docs</span>
                    {batch.failedDocuments > 0 && (
                      <span className="text-red-500 ml-1">• {batch.failedDocuments} failed</span>
                    )}
                  </p>
                  <span className="text-muted-foreground/40">•</span>
                  <span className="text-xs text-muted-foreground/70">
                    {format(new Date(batch.createdAt), 'MMM d, h:mm a')}
                  </span>
                </div>
                {batch.status === 'processing' && (
                  <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function UploadPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { searchIndex, isLoading, isError } = useSearchIndex(id);

  // Loading state
  if (isLoading) {
    return <PageSkeleton />;
  }

  // Error state
  if (isError || !searchIndex) {
    return (
      <div className="flex-1 p-6 lg:p-8">
        <div className="text-center py-16">
          <div className="flex size-20 items-center justify-center rounded-2xl bg-destructive/10 mx-auto mb-6">
            <AlertCircle className="size-10 text-destructive/70" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Failed to load search index</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            The search index could not be found or there was an error loading it.
          </p>
          <Button variant="outline" className="mt-6 rounded-xl" onClick={() => router.push('/search-indexes')}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Search Indexes
          </Button>
        </div>
      </div>
    );
  }

  const typeColors = getSearchTypeColor(searchIndex.searchType as SearchType);

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/search-indexes" className="hover:text-foreground transition-colors">
          Search Indexes
        </Link>
        <ChevronLeft className="h-4 w-4 rotate-180" />
        <Link href={`/search-indexes/${id}`} className="hover:text-foreground transition-colors">
          {searchIndex.displayName}
        </Link>
        <ChevronLeft className="h-4 w-4 rotate-180" />
        <span className="text-foreground font-medium">Upload Documents</span>
      </nav>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="relative">
          <div className={`flex size-14 items-center justify-center rounded-xl shadow-sm bg-gradient-to-br ${typeColors.iconBg} ring-1 ${typeColors.ring}`}>
            <Upload className={`size-7 ${typeColors.icon}`} />
          </div>
          {searchIndex.isActive && searchIndex.status === 'ready' && (
            <div className="absolute -right-0.5 -bottom-0.5 flex items-center justify-center size-5 rounded-full bg-emerald-500 ring-2 ring-background">
              <Zap className="size-3 text-white fill-white" />
            </div>
          )}
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Upload Documents</h1>
          <div className="flex items-center gap-2 mt-1.5 text-muted-foreground">
            <Database className="h-4 w-4" />
            <span className="text-base">{searchIndex.displayName}</span>
            <span className="text-muted-foreground/50">•</span>
            <code className="text-xs bg-muted/50 px-2 py-0.5 rounded-md font-mono">
              {searchIndex.name}
            </code>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main upload panel */}
        <div className="lg:col-span-2">
          <Card className="border-border/60 shadow-sm rounded-2xl">
            <CardContent className="p-6">
              <DocumentUploadPanel
                searchIndexId={id}
                onComplete={() => {
                  // Could navigate or refresh
                }}
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Index info */}
          <Card className="border-border/60 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 font-semibold">
                <Database className="h-4 w-4 text-blue-500" />
                Index Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Documents stat */}
              <div className="p-3 bg-muted/30 rounded-xl border border-border/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Documents</span>
                  </div>
                  <span className="text-lg font-bold tabular-nums">
                    {searchIndex.documentCount?.toLocaleString() || 0}
                  </span>
                </div>
              </div>

              {/* Search Type */}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Search Type</span>
                <Badge className={`${typeColors.badge} rounded-lg px-2.5 py-1 text-xs font-semibold capitalize`}>
                  {getSearchTypeIcon(searchIndex.searchType as SearchType, 'size-3 mr-1.5 inline')}
                  {searchIndex.searchType}
                </Badge>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-semibold capitalize',
                    searchIndex.status === 'ready' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
                    searchIndex.status === 'indexing' && 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
                    searchIndex.status === 'creating' && 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                    searchIndex.status === 'error' && 'bg-red-500/15 text-red-700 dark:text-red-400'
                  )}
                >
                  {searchIndex.status === 'ready' && <CheckCircle2 className="size-3 mr-1.5 inline" />}
                  {searchIndex.status === 'indexing' && <Loader2 className="size-3 mr-1.5 inline animate-spin" />}
                  {searchIndex.status}
                </Badge>
              </div>

              {/* Last Indexed */}
              {searchIndex.lastIndexedAt && (
                <div className="flex items-center justify-between py-2 border-t border-border/50 pt-4">
                  <span className="text-sm text-muted-foreground">Last Indexed</span>
                  <span className="text-sm font-medium">
                    {format(new Date(searchIndex.lastIndexedAt), 'MMM d, h:mm a')}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent uploads */}
          <BatchHistory searchIndexId={id} />
        </div>
      </div>
    </div>
  );
}
