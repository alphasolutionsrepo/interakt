// app/settings/cache/page.tsx

'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  RefreshCw,
  Settings2,
  Trash2,
  Database,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCacheManagement } from './_lib/hooks/useCacheManagement';
import { CACHE_FEATURES } from './_lib/api-client';
import { CacheStatsGrid, CacheFeatureCard } from './_components';
import { PageHeader } from '@/shared/ui/custom/PageHeader';

// ============================================================================
// Page Skeleton
// ============================================================================

function CachePageSkeleton() {
  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>

      {/* Stats Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-2xl border border-border/60 p-6">
            <Skeleton className="h-12 w-12 rounded-xl mb-4" />
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>

      {/* Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl border border-border/60 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function CacheManagementPage() {
  const {
    stats,
    aggregateStats,
    isLoading,
    isError,
    error,
    refetch,
    clearCache,
    clearAllCaches,
    isClearingCache,
    isClearingAllCaches,
    clearingFeatureId,
  } = useCacheManagement();

  // Loading state
  if (isLoading) {
    return <CachePageSkeleton />;
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/15">
          <RefreshCw className="size-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold">Failed to load cache statistics</h2>
        <p className="max-w-md text-center text-muted-foreground">
          {error?.message || 'An error occurred while loading cache data'}
        </p>
        <Button onClick={() => refetch()} className="rounded-xl">
          <RefreshCw className="mr-2 size-4" />
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Header */}
      <PageHeader
        variant="settings"
        title="Cache Management"
        description="Monitor and manage application caches for optimal performance"
        icon={Database}
        iconBg="bg-primary/10"
        iconColor="text-primary"
        breadcrumb={
          <>
            <Settings2 className="size-4" />
            <span className="font-medium">Settings</span>
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => refetch()}
              className="rounded-xl"
            >
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="rounded-xl shadow-lg"
                  disabled={isClearingAllCaches || (aggregateStats?.totalEntries ?? 0) === 0}
                >
                  <Trash2 className="mr-2 size-4" />
                  Clear All Caches
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="size-5 text-destructive" />
                    Clear All Caches?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will clear all cached data across all features. This action cannot be undone.
                    The application may experience temporary slowdowns as caches are rebuilt.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => clearAllCaches()}
                    className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Clear All Caches
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      {/* Overview Stats */}
      <CacheStatsGrid
        totalEntries={aggregateStats?.totalEntries ?? 0}
        totalMaxSize={aggregateStats?.totalMaxSize ?? 0}
        totalPending={aggregateStats?.totalPending ?? 0}
        featuresCount={CACHE_FEATURES.length}
      />

      {/* Info Alert */}
      <Alert className="rounded-2xl border-border/60">
        <Info className="size-4" />
        <AlertTitle>In-Memory Cache</AlertTitle>
        <AlertDescription>
          The application uses an in-memory cache with automatic TTL expiration and LRU eviction.
          Cache data is lost on server restart. Each feature has its own isolated cache instance
          with configurable TTL settings.
        </AlertDescription>
      </Alert>

      {/* Feature Cards */}
      <div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
          <Database className="size-4" />
          <span className="font-medium">Cache Instances</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {CACHE_FEATURES.map((feature) => (
            <CacheFeatureCard
              key={feature.id}
              feature={feature}
              stats={stats?.[feature.id]}
              onClear={() => clearCache(feature.id)}
              isClearing={isClearingCache && clearingFeatureId === feature.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
