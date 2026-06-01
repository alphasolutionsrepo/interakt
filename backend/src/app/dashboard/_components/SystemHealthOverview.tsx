// app/dashboard/_components/SystemHealthOverview.tsx

'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Shield,
  CheckCircle2,
  AlertCircle,
  Clock,
  WifiOff,
  Activity,
  Database,
  Sparkles,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import type { SystemHealth } from '../_lib/hooks/useDashboardData';

// ============================================================================
// GLOW CARD
// ============================================================================

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}

function GlowCard({
  children,
  className = '',
  glowColor = 'from-blue-500/20 via-purple-500/20 to-pink-500/20',
}: GlowCardProps) {
  return (
    <div className={`group relative ${className}`}>
      <div
        className={`absolute -inset-0.5 rounded-2xl bg-gradient-to-r ${glowColor} opacity-0 blur-xl transition-all duration-500 group-hover:opacity-100`}
      />
      <div className="relative rounded-2xl border border-border/60 bg-card shadow-sm transition-shadow duration-300 group-hover:shadow-md">
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function getOverallStatusInfo(status: 'healthy' | 'warning' | 'error') {
  switch (status) {
    case 'healthy':
      return {
        icon: <CheckCircle2 className="size-5" />,
        label: 'All Systems Operational',
        color: 'text-emerald-500',
        bg: 'bg-emerald-500/15',
        badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
      };
    case 'warning':
      return {
        icon: <AlertTriangle className="size-5" />,
        label: 'Some Issues Detected',
        color: 'text-amber-500',
        bg: 'bg-amber-500/15',
        badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
      };
    case 'error':
      return {
        icon: <AlertCircle className="size-5" />,
        label: 'Attention Required',
        color: 'text-destructive',
        bg: 'bg-destructive/15',
        badge: 'bg-destructive/15 text-destructive',
      };
  }
}

// ============================================================================
// STATUS ITEM
// ============================================================================

interface StatusItemProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  status: 'success' | 'warning' | 'error' | 'neutral';
}

function StatusItem({ icon, label, count, status }: StatusItemProps) {
  const statusColors = {
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    error: 'text-destructive',
    neutral: 'text-muted-foreground',
  };

  if (count === 0) return null;

  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={statusColors[status]}>{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className={`text-sm font-bold tabular-nums ${statusColors[status]}`}>
        {count}
      </span>
    </div>
  );
}

// ============================================================================
// SECTION
// ============================================================================

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function Section({ title, icon, children }: SectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        {icon}
        <span className="uppercase tracking-wider">{title}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

// ============================================================================
// SYSTEM HEALTH OVERVIEW
// ============================================================================

interface SystemHealthOverviewProps {
  health: SystemHealth;
}

export function SystemHealthOverview({ health }: SystemHealthOverviewProps) {
  const statusInfo = getOverallStatusInfo(health.overallStatus);
  const totalIndexes =
    health.indexes.ready +
    health.indexes.creating +
    health.indexes.indexing +
    health.indexes.error +
    health.indexes.offline;
  const totalExperiences = health.experiences.active + health.experiences.inactive;

  return (
    <GlowCard
      glowColor={
        health.overallStatus === 'healthy'
          ? 'from-emerald-500/20 via-green-500/20 to-teal-500/20'
          : health.overallStatus === 'warning'
            ? 'from-amber-500/20 via-orange-500/20 to-yellow-500/20'
            : 'from-red-500/20 via-rose-500/20 to-pink-500/20'
      }
    >
      <div className="p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex size-10 items-center justify-center rounded-xl ${statusInfo.bg}`}>
              <Shield className={`size-5 ${statusInfo.color}`} />
            </div>
            <div>
              <h3 className="font-semibold tracking-tight">System Health</h3>
              <p className="text-sm text-muted-foreground">Status overview</p>
            </div>
          </div>
        </div>

        {/* Overall Status */}
        <div
          className={`mb-6 flex items-center gap-3 rounded-xl ${statusInfo.bg} px-4 py-3`}
        >
          <span className={statusInfo.color}>{statusInfo.icon}</span>
          <span className={`font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
        </div>

        {/* Index Health */}
        {totalIndexes > 0 && (
          <Section title="Indexes" icon={<Database className="size-4" />}>
            <StatusItem
              icon={<CheckCircle2 className="size-4" />}
              label="Ready"
              count={health.indexes.ready}
              status="success"
            />
            <StatusItem
              icon={<Clock className="size-4" />}
              label="Creating"
              count={health.indexes.creating}
              status="warning"
            />
            <StatusItem
              icon={<Activity className="size-4 animate-pulse" />}
              label="Indexing"
              count={health.indexes.indexing}
              status="warning"
            />
            <StatusItem
              icon={<AlertCircle className="size-4" />}
              label="Error"
              count={health.indexes.error}
              status="error"
            />
            <StatusItem
              icon={<WifiOff className="size-4" />}
              label="Offline"
              count={health.indexes.offline}
              status="neutral"
            />
          </Section>
        )}

        {/* Experience Health */}
        {totalExperiences > 0 && (
          <div className="mt-4">
            <Section title="Experiences" icon={<Sparkles className="size-4" />}>
              <StatusItem
                icon={<CheckCircle2 className="size-4" />}
                label="Active"
                count={health.experiences.active}
                status="success"
              />
              <StatusItem
                icon={<WifiOff className="size-4" />}
                label="Inactive"
                count={health.experiences.inactive}
                status="neutral"
              />
            </Section>
          </div>
        )}

        {/* Empty State */}
        {totalIndexes === 0 && totalExperiences === 0 && (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No resources configured yet
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 border-t border-border/50 pt-4">
          <Button variant="ghost" size="sm" asChild className="w-full rounded-lg">
            <Link href="/health" className="flex items-center justify-center gap-1.5">
              View Details
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </GlowCard>
  );
}
