// app/dashboard/_components/HeroSection.tsx

'use client';

import { Badge } from '@/components/ui/badge';
import {
  Search,
  Database,
  Sparkles,
  TrendingUp,
  Clock,
  CheckCircle2,
  Zap,
  Activity,
} from 'lucide-react';
import type { DashboardQuickStats } from '../_lib/hooks/useDashboardData';

// ============================================================================
// GLOW CARD - Consistent with listing pages
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
      {/* Glow effect */}
      <div
        className={`absolute -inset-0.5 rounded-2xl bg-gradient-to-r ${glowColor} opacity-0 blur-xl transition-all duration-500 group-hover:opacity-100`}
      />
      {/* Card */}
      <div className="relative rounded-2xl border border-border/60 bg-card shadow-sm transition-shadow duration-300 group-hover:shadow-md">
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// METRIC CARD - Matching listing pages style
// ============================================================================

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  gradient: string;
  iconBg: string;
  iconColor: string;
  trend?: string;
  trendIcon?: React.ReactNode;
  trendColor?: string;
}

function MetricCard({
  label,
  value,
  icon,
  gradient,
  iconBg,
  trend,
  trendIcon,
  trendColor,
}: MetricCardProps) {
  return (
    <GlowCard glowColor={gradient}>
      <div className="p-6">
        <div className="flex h-[72px] items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col justify-between h-full">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground truncate">
              {label}
            </p>
            <div className="flex items-baseline gap-2.5">
              <p className="text-3xl font-bold tracking-tight">{value}</p>
              {trend && (
                <Badge
                  className={`${trendColor || 'bg-primary/10 text-primary'} border-0 px-2 py-0.5 text-[10px] font-bold`}
                >
                  {trendIcon}
                  {trend}
                </Badge>
              )}
            </div>
          </div>
          <div
            className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${iconBg} shadow-sm ring-1 ring-border/30`}
          >
            {icon}
          </div>
        </div>
      </div>
    </GlowCard>
  );
}

// ============================================================================
// GREETING HELPER
// ============================================================================

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

// ============================================================================
// HERO SECTION
// ============================================================================

interface HeroSectionProps {
  stats: DashboardQuickStats;
}

export function HeroSection({ stats }: HeroSectionProps) {
  const greeting = getGreeting();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">
          {greeting}
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Here&apos;s what&apos;s happening with your search platform today.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Searches Today"
          value={stats.totalSearches24h.toLocaleString()}
          icon={<Search className="size-6 text-blue-500" />}
          gradient="from-blue-500/30 via-cyan-500/30 to-teal-500/30"
          iconBg="bg-blue-500/15"
          iconColor="text-blue-500"
          trend={stats.totalSearches24h > 0 ? 'Active' : undefined}
          trendIcon={<Activity className="mr-1 size-2.5 animate-pulse" />}
          trendColor="bg-blue-500/15 text-blue-600 dark:text-blue-400"
        />
        <MetricCard
          label="Active Indexes"
          value={stats.activeIndexes}
          icon={<Database className="size-6 text-emerald-500" />}
          gradient="from-emerald-500/30 via-green-500/30 to-teal-500/30"
          iconBg="bg-emerald-500/15"
          iconColor="text-emerald-500"
          trend={stats.activeIndexes > 0 ? 'Ready' : undefined}
          trendIcon={<CheckCircle2 className="mr-1 size-2.5" />}
          trendColor="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
        />
        <MetricCard
          label="Experiences"
          value={stats.activeExperiences}
          icon={<Sparkles className="size-6 text-violet-500" />}
          gradient="from-violet-500/30 via-purple-500/30 to-fuchsia-500/30"
          iconBg="bg-violet-500/15"
          iconColor="text-violet-500"
          trend={stats.activeExperiences > 0 ? 'Live' : undefined}
          trendIcon={<Zap className="mr-1 size-2.5" />}
          trendColor="bg-violet-500/15 text-violet-600 dark:text-violet-400"
        />
        <MetricCard
          label="Avg Response"
          value={formatMs(stats.avgResponseTime)}
          icon={<Clock className="size-6 text-amber-500" />}
          gradient="from-amber-500/30 via-orange-500/30 to-red-500/30"
          iconBg="bg-amber-500/15"
          iconColor="text-amber-500"
          trend={
            stats.avgResponseTime > 0 && stats.avgResponseTime < 300
              ? 'Fast'
              : undefined
          }
          trendIcon={<TrendingUp className="mr-1 size-2.5" />}
          trendColor="bg-amber-500/15 text-amber-600 dark:text-amber-400"
        />
      </div>
    </div>
  );
}
