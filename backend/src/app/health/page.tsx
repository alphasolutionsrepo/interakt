// app/health/page.tsx

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity,
  RefreshCw,
  Shield,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FlaskConical,
} from 'lucide-react';
import Link from 'next/link';
import { useSystemHealth } from './_lib/hooks/useHealth';
import { HealthStatsBar, ServiceStatusCard } from './_components';
import { PageHeader } from '@/shared/ui/custom/PageHeader';

// ============================================================================
// Page Skeleton
// ============================================================================

function HealthPageSkeleton() {
  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>

      {/* Stats Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="rounded-2xl border border-border/60 p-6">
            <Skeleton className="h-12 w-12 rounded-xl mb-4" />
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>

      {/* Services Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="rounded-2xl border border-border/60 p-6">
            <Skeleton className="h-6 w-32 mb-4" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function HealthPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { data: health, isLoading, isError, error, refetch } = useSystemHealth(
    autoRefresh ? { refetchInterval: 30000 } : undefined
  );

  const handleManualRefresh = () => {
    refetch();
  };

  // Loading state
  if (isLoading) {
    return <HealthPageSkeleton />;
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/15">
          <RefreshCw className="size-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold">Failed to load health status</h2>
        <p className="max-w-md text-center text-muted-foreground">
          {error instanceof Error ? error.message : 'An error occurred while checking system health'}
        </p>
        <Button onClick={() => refetch()} className="rounded-xl">
          <RefreshCw className="mr-2 size-4" />
          Try Again
        </Button>
      </div>
    );
  }

  if (!health) {
    return null;
  }

  // Determine overall status icon and color
  const StatusIcon = health.status === 'healthy'
    ? CheckCircle2
    : health.status === 'degraded'
    ? AlertTriangle
    : XCircle;

  const statusColor = health.status === 'healthy'
    ? 'text-green-600'
    : health.status === 'degraded'
    ? 'text-amber-600'
    : 'text-red-600';

  const statusBg = health.status === 'healthy'
    ? 'bg-green-500/10'
    : health.status === 'degraded'
    ? 'bg-amber-500/10'
    : 'bg-red-500/10';

  // Categorize services - AI Providers first, then infrastructure
  const primaryServices = health.services.filter(s =>
    s.name === 'AI Providers'
  );
  const infrastructureServices = health.services.filter(s =>
    s.name === 'Database (PostgreSQL)' || s.name === 'Elasticsearch'
  );

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8">
      {/* Header */}
      <PageHeader
        variant="settings"
        title="System Health"
        description="Monitor the status of all external dependencies and services"
        breadcrumb={
          <>
            <Shield className="size-4" />
            <span className="font-medium">System Monitoring</span>
          </>
        }
        customIcon={
          <div className={`flex size-12 items-center justify-center rounded-xl ${statusBg} shrink-0`}>
            <StatusIcon className={`size-6 ${statusColor}`} />
          </div>
        }
        actions={
          <>
            <Button
              variant="outline"
              asChild
              className="rounded-xl"
            >
              <Link href="/playground">
                <FlaskConical className="mr-2 size-4" />
                Test Queries
              </Link>
            </Button>
            <Button
              variant={autoRefresh ? 'default' : 'outline'}
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="rounded-xl"
            >
              <Activity className={`mr-2 size-4 ${autoRefresh ? 'animate-pulse' : ''}`} />
              {autoRefresh ? 'Auto-Refresh' : 'Manual'}
            </Button>
            <Button
              variant="outline"
              onClick={handleManualRefresh}
              className="rounded-xl"
            >
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </Button>
          </>
        }
      />

      {/* Stats Overview */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Overview</h2>
        <HealthStatsBar health={health} />
      </div>

      {/* Primary Services - AI Providers */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">AI Services</h2>
          <span className="text-xs text-muted-foreground">
            {new Date(health.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {primaryServices.map((service, index) => (
            <ServiceStatusCard key={service.name} service={service} index={index} />
          ))}
        </div>
      </div>

      {/* Infrastructure Services */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Infrastructure Services</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {infrastructureServices.map((service, index) => (
            <ServiceStatusCard key={service.name} service={service} index={index + primaryServices.length} />
          ))}
        </div>
      </div>
    </div>
  );
}
