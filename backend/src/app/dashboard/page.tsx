// app/dashboard/page.tsx

'use client';

import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDashboardData } from './_lib/hooks/useDashboardData';
import { HeroSection } from './_components/HeroSection';
import { QuickActionsGrid } from './_components/QuickActionsGrid';
import { RecentActivityFeed } from './_components/RecentActivityFeed';
import { SystemHealthOverview } from './_components/SystemHealthOverview';
import { AnalyticsSummaryWidgets } from './_components/AnalyticsSummaryWidgets';
import {
  PageHeaderSkeleton,
  StatsCardsSkeleton,
  TableSkeleton,
} from '@/shared/ui/custom/skeletons';

// ============================================================================
// LOADING SKELETON
// ============================================================================

function DashboardSkeleton() {
  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Hero Skeleton */}
      <PageHeaderSkeleton showBreadcrumb={false} />
      <StatsCardsSkeleton count={4} columns={4} />

      {/* Quick Actions Skeleton */}
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-6 w-32 animate-pulse rounded bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-[220px] animate-pulse rounded-2xl border border-border/60 bg-muted/30"
            />
          ))}
        </div>
      </div>

      {/* Activity & Health Skeleton */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TableSkeleton rows={5} showSearch={false} />
        </div>
        <div className="h-[400px] animate-pulse rounded-2xl border border-border/60 bg-muted/30" />
      </div>

      {/* Analytics Skeleton */}
      <StatsCardsSkeleton count={3} columns={3} />
    </div>
  );
}

// ============================================================================
// ERROR STATE
// ============================================================================

interface ErrorStateProps {
  onRetry: () => void;
}

function ErrorState({ onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/15">
        <RefreshCw className="size-8 text-destructive" />
      </div>
      <h2 className="text-xl font-semibold">Failed to load dashboard</h2>
      <p className="max-w-md text-center text-muted-foreground">
        We couldn&apos;t load your dashboard data. Please check your connection and try again.
      </p>
      <Button onClick={onRetry} className="rounded-xl">
        <RefreshCw className="mr-2 size-4" />
        Try Again
      </Button>
    </div>
  );
}

// ============================================================================
// MAIN DASHBOARD PAGE
// ============================================================================

export default function DashboardPage() {
  const { data, isLoading, isError, hasPartialError, isRefetching, refetch } = useDashboardData();

  // Loading state
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // Error state - only if ALL data sources failed
  if (isError) {
    return <ErrorState onRetry={refetch} />;
  }

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Partial Error Banner */}
      {hasPartialError && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="size-5 text-amber-500" />
          <p className="flex-1 text-sm font-medium text-amber-700 dark:text-amber-400">
            Some data couldn&apos;t be loaded. Showing available information.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={refetch}
            disabled={isRefetching}
            className="rounded-lg text-amber-700 hover:text-amber-800 dark:text-amber-400"
          >
            <RefreshCw className={`mr-1.5 size-4 ${isRefetching ? 'animate-spin' : ''}`} />
            Retry
          </Button>
        </div>
      )}

      {/* Refresh Button (floating) */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={refetch}
          disabled={isRefetching}
          className="size-12 rounded-xl border-border/50 bg-background/80 shadow-lg backdrop-blur-sm"
        >
          <RefreshCw className={`size-5 ${isRefetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Hero Section */}
      <HeroSection stats={data.quickStats} />

      {/* Quick Actions */}
      <QuickActionsGrid counts={data.resourceCounts} />

      {/* Activity & Health Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivityFeed activity={data.recentActivity} />
        </div>
        <div>
          <SystemHealthOverview health={data.systemHealth} />
        </div>
      </div>

      {/* Analytics Summary */}
      <AnalyticsSummaryWidgets analytics={data.analytics} />
    </div>
  );
}
