// app/dashboard/_components/QuickActionsGrid.tsx

'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  Database,
  Sparkles,
  TestTube,
  Settings,
  Plus,
  Eye,
  ArrowUpRight,
  Activity,
  Bot,
  Search,
  MemoryStick,
  TrendingUp,
} from 'lucide-react';
import type { ResourceCounts } from '../_lib/hooks/useDashboardData';

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
    <div className={`group relative cursor-pointer ${className}`}>
      {/* Glow effect */}
      <div
        className={`absolute -inset-0.5 rounded-2xl bg-gradient-to-r ${glowColor} opacity-0 blur-xl transition-all duration-500 group-hover:opacity-100`}
      />
      {/* Card */}
      <div className="relative h-full rounded-2xl border border-border/60 bg-card shadow-sm transition-shadow duration-300 group-hover:shadow-md">
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// TYPES
// ============================================================================

interface QuickAction {
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  count?: number;
  countLabel?: string;
  iconColor: string;
  iconBg: string;
  gradient: string;
  ring: string;
  badgeStyle: string;
  subActions: Array<{
    label: string;
    href: string;
    icon: React.ElementType;
  }>;
}

// ============================================================================
// ACTION CARD - Matching listing pages card style
// ============================================================================

interface ActionCardProps {
  action: QuickAction;
}

function ActionCard({ action }: ActionCardProps) {
  const router = useRouter();
  const Icon = action.icon;

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-subaction]')) {
      router.push(action.href);
    }
  };

  return (
    <GlowCard glowColor={action.gradient}>
      <div
        onClick={handleCardClick}
        className="flex h-full cursor-pointer flex-col p-6"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            router.push(action.href);
          }
        }}
      >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="relative">
            <div
              className={`flex size-14 items-center justify-center rounded-xl ${action.iconBg} shadow-sm ring-1 ${action.ring}`}
            >
              <Icon className={`size-7 ${action.iconColor}`} />
            </div>
          </div>
          {action.count !== undefined && (
            <Badge className={`${action.badgeStyle} border-0 px-2.5 py-1 text-xs font-semibold`}>
              {action.count} {action.countLabel || ''}
            </Badge>
          )}
        </div>

        {/* Content */}
        <h3 className="mb-2 text-xl font-medium tracking-tight transition-colors group-hover:text-primary">
          {action.title}
        </h3>
        <p className="mb-5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {action.description}
        </p>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Sub Actions */}
        <div className="flex flex-wrap gap-2 border-t border-border/50 pt-5">
          {action.subActions.map((subAction) => {
            const SubIcon = subAction.icon;
            return (
              <Link
                key={subAction.href}
                href={subAction.href}
                data-subaction
                className="inline-flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <SubIcon className="size-3.5" />
                {subAction.label}
              </Link>
            );
          })}
        </div>

        {/* Arrow indicator */}
        <div className="mt-4 flex items-center justify-end">
          <ArrowUpRight className="size-5 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary group-hover:opacity-100" />
        </div>
      </div>
    </GlowCard>
  );
}

// ============================================================================
// QUICK ACTIONS GRID
// ============================================================================

interface QuickActionsGridProps {
  counts: ResourceCounts;
}

export function QuickActionsGrid({ counts }: QuickActionsGridProps) {
  // Core platform features
  const platformActions: QuickAction[] = [
    {
      title: 'AI Experiences',
      description:
        'Create conversational AI experiences with tool use, guardrails, and deterministic pipelines.',
      icon: Bot,
      href: '/experiences?type=ai',
      count: counts.aiExperiences.active,
      countLabel: 'active',
      iconColor: 'text-violet-500',
      iconBg: 'bg-violet-500/15',
      gradient: 'from-violet-500/30 via-purple-500/30 to-fuchsia-500/30',
      ring: 'ring-violet-500/30',
      badgeStyle: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
      subActions: [
        { label: 'Create New', href: '/experiences/create?type=ai', icon: Plus },
        { label: 'View All', href: '/experiences?type=ai', icon: Eye },
      ],
    },
    {
      title: 'Search Experiences',
      description:
        'Build search interfaces with filters, facets, and AI-powered summaries for your storefront.',
      icon: Sparkles,
      href: '/experiences?type=search',
      count: counts.searchExperiences.active,
      countLabel: 'active',
      iconColor: 'text-emerald-500',
      iconBg: 'bg-emerald-500/15',
      gradient: 'from-emerald-500/30 via-green-500/30 to-teal-500/30',
      ring: 'ring-emerald-500/30',
      badgeStyle: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
      subActions: [
        { label: 'Create New', href: '/experiences/create?type=search', icon: Plus },
        { label: 'View All', href: '/experiences?type=search', icon: Eye },
      ],
    },
    {
      title: 'Search Indexes',
      description:
        'Manage your search indexes, field mappings, and document ingestion pipelines.',
      icon: Database,
      href: '/search-indexes',
      count: counts.indexes.total,
      countLabel: 'indexes',
      iconColor: 'text-blue-500',
      iconBg: 'bg-blue-500/15',
      gradient: 'from-blue-500/30 via-cyan-500/30 to-teal-500/30',
      ring: 'ring-blue-500/30',
      badgeStyle: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
      subActions: [
        { label: 'Create New', href: '/search-indexes/create', icon: Plus },
        { label: 'View All', href: '/search-indexes', icon: Eye },
      ],
    },
  ];

  // Tools and insights
  const toolsActions: QuickAction[] = [
    {
      title: 'Analytics',
      description:
        'Monitor search performance, track user behavior, and discover optimization opportunities.',
      icon: TrendingUp,
      href: '/analytics/overview',
      iconColor: 'text-indigo-500',
      iconBg: 'bg-indigo-500/15',
      gradient: 'from-indigo-500/30 via-blue-500/30 to-cyan-500/30',
      ring: 'ring-indigo-500/30',
      badgeStyle: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
      subActions: [
        { label: 'Overview', href: '/analytics/overview', icon: Activity },
        { label: 'Traces', href: '/analytics/traces', icon: Search },
      ],
    },
    {
      title: 'Playground',
      description:
        'Test and experiment with search queries, AI capabilities, and unified search features.',
      icon: TestTube,
      href: '/playground/ai-service',
      iconColor: 'text-amber-500',
      iconBg: 'bg-amber-500/15',
      gradient: 'from-amber-500/30 via-orange-500/30 to-red-500/30',
      ring: 'ring-amber-500/30',
      badgeStyle: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
      subActions: [
        { label: 'AI Service', href: '/playground/ai-service', icon: Bot },
        { label: 'Search', href: '/playground/search', icon: Search },
      ],
    },
    {
      title: 'Settings',
      description:
        'Configure AI providers, manage system health, and control cache settings.',
      icon: Settings,
      href: '/ai-providers',
      iconColor: 'text-slate-500',
      iconBg: 'bg-slate-500/15',
      gradient: 'from-slate-500/30 via-gray-500/30 to-zinc-500/30',
      ring: 'ring-slate-500/30',
      badgeStyle: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
      subActions: [
        { label: 'AI Providers', href: '/ai-providers', icon: Bot },
        { label: 'Health', href: '/health', icon: Activity },
        { label: 'Cache', href: '/settings/cache', icon: MemoryStick },
      ],
    },
  ];

  return (
    <div className="space-y-12">
      {/* Experiences & Data */}
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Platform</h2>
          <p className="text-sm text-muted-foreground">
            Manage your experiences and data
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {platformActions.map((action) => (
            <ActionCard key={action.href} action={action} />
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border/50" />
        </div>
      </div>

      {/* Tools & Insights Section */}
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Tools & Insights</h2>
          <p className="text-sm text-muted-foreground">
            Analyze, test, and configure your platform
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {toolsActions.map((action) => (
            <ActionCard key={action.href} action={action} />
          ))}
        </div>
      </div>
    </div>
  );
}
