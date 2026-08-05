// app/search-indexes/(pages)/[id]/documents/page.tsx

/**
 * Manage Documents Page
 *
 * Inspect and remove individual documents from a search index, without having to
 * re-upload the whole dataset.
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
  AlertCircle,
  CheckCircle2,
  Loader2,
  Layers,
  FileCog,
} from 'lucide-react';
import { useSearchIndex } from '../../../_lib/hooks/useSearchIndexes';
import { DocumentManagerPanel } from '../../../_components/DocumentManager';
import { cn } from '@/lib/utils';

// ============================================================================
// SKELETON
// ============================================================================

function PageSkeleton() {
  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      <Skeleton className="h-4 w-48 rounded-lg" />
      <div className="flex items-start gap-4">
        <Skeleton className="size-14 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="h-4 w-48 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-80 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PAGE
// ============================================================================

export default function ManageDocumentsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { searchIndex, isLoading, isError } = useSearchIndex(id);

  if (isLoading) {
    return <PageSkeleton />;
  }

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
          <Button
            variant="outline"
            className="mt-6 rounded-xl"
            onClick={() => router.push('/search-indexes')}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Search Indexes
          </Button>
        </div>
      </div>
    );
  }

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
        <span className="text-foreground font-medium">Manage Documents</span>
      </nav>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex size-14 items-center justify-center rounded-xl shadow-sm bg-gradient-to-br from-slate-500/10 to-slate-600/10 ring-1 ring-slate-500/20">
          <FileCog className="size-7 text-slate-500" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Manage Documents</h1>
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
        <div className="lg:col-span-2">
          <DocumentManagerPanel searchIndexId={id} />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="border-border/60 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 font-semibold">
                <Database className="h-4 w-4 text-blue-500" />
                Index Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  {searchIndex.status === 'indexing' && (
                    <Loader2 className="size-3 mr-1.5 inline animate-spin" />
                  )}
                  {searchIndex.status}
                </Badge>
              </div>

              <Button
                variant="outline"
                className="w-full rounded-xl"
                onClick={() => router.push(`/search-indexes/${id}/upload`)}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Documents
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Adding & updating</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Adding and updating documents one at a time is done over the API rather than here:
              </p>
              <ul className="space-y-1.5 font-mono text-xs">
                <li>
                  <span className="text-emerald-600 dark:text-emerald-400">PUT</span>{' '}
                  /documents/:id — replace
                </li>
                <li>
                  <span className="text-blue-600 dark:text-blue-400">PATCH</span>{' '}
                  /documents/:id — partial update
                </li>
                <li>
                  <span className="text-red-600 dark:text-red-400">DELETE</span>{' '}
                  /documents/:id — remove
                </li>
                <li>
                  <span className="text-amber-600 dark:text-amber-400">POST</span>{' '}
                  /documents/bulk — mixed batch
                </li>
              </ul>
              <p className="text-xs">
                All paths are relative to{' '}
                <code className="bg-muted/50 px-1 py-0.5 rounded">
                  /api/search-indexes/{id}
                </code>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
