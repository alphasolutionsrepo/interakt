// app/dashboard/_components/RecentActivityFeed.tsx

'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Search,
  CheckCircle2,
  XCircle,
  Brain,
  FileText,
  Zap,
  Clock,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { RecentSearchEvent } from '@/app/analytics/_lib/hooks/useAnalytics';

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

function getSearchTypeInfo(searchType: string) {
  switch (searchType?.toLowerCase()) {
    case 'lexical':
      return {
        icon: <FileText className="size-3.5" />,
        badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25',
        label: 'Lexical',
      };
    case 'semantic':
      return {
        icon: <Brain className="size-3.5" />,
        badge: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/25',
        label: 'Semantic',
      };
    case 'hybrid':
      return {
        icon: <Zap className="size-3.5" />,
        badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25',
        label: 'Hybrid',
      };
    default:
      return {
        icon: <Search className="size-3.5" />,
        badge: 'bg-muted text-muted-foreground border-border',
        label: searchType || 'Search',
      };
  }
}

function formatRelativeTime(timestamp: string): string {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  } catch {
    return 'recently';
  }
}

// ============================================================================
// ACTIVITY ITEM
// ============================================================================

interface ActivityItemProps {
  event: RecentSearchEvent;
}

function ActivityItem({ event }: ActivityItemProps) {
  const typeInfo = getSearchTypeInfo(event.searchType);

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/40 px-4 py-3 transition-colors hover:bg-muted/60">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Search className="size-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={event.query}>
            {event.query || 'Empty query'}
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="size-3" />
            <span>{formatRelativeTime(event.timestamp)}</span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <Badge className={`${typeInfo.badge} rounded-lg px-2 py-1 text-xs font-semibold`}>
          {typeInfo.icon}
          <span className="ml-1">{typeInfo.label}</span>
        </Badge>
        <span className="min-w-[50px] text-right text-sm tabular-nums font-medium">
          {event.totalResults} <span className="text-muted-foreground">results</span>
        </span>
        {event.success ? (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
        ) : (
          <XCircle className="size-4 shrink-0 text-destructive" />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted/50">
        <Activity className="size-8 text-muted-foreground" />
      </div>
      <h3 className="mb-2 font-medium">No recent activity</h3>
      <p className="max-w-[250px] text-sm text-muted-foreground">
        Search activity will appear here as users interact with your search experiences.
      </p>
    </div>
  );
}

// ============================================================================
// RECENT ACTIVITY FEED
// ============================================================================

interface RecentActivityFeedProps {
  activity: RecentSearchEvent[];
}

export function RecentActivityFeed({ activity }: RecentActivityFeedProps) {
  return (
    <GlowCard glowColor="from-indigo-500/20 via-blue-500/20 to-cyan-500/20">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/15">
              <Activity className="size-5 text-indigo-500" />
            </div>
            <div>
              <h3 className="font-semibold tracking-tight">Recent Activity</h3>
              <p className="text-sm text-muted-foreground">Latest search queries</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" asChild className="rounded-lg">
            <Link href="/analytics/overview" className="flex items-center gap-1.5">
              View All
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        {/* Activity List */}
        {activity.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {activity.slice(0, 6).map((event) => (
              <ActivityItem key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </GlowCard>
  );
}
