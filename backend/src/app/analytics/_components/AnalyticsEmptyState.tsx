// app/analytics/_components/AnalyticsEmptyState.tsx

'use client';

import { TrendingUp, Zap, Activity, Target, BarChart3, Brain } from 'lucide-react';
import { Button } from '@/shared/ui/components/button';

interface AnalyticsEmptyStateProps {
  variant?: 'overview' | 'performance';
  onRefresh?: () => void;
}

export function AnalyticsEmptyState({ variant = 'overview', onRefresh }: AnalyticsEmptyStateProps) {
  const content = {
    overview: {
      title: 'No Search Activity Yet',
      subtitle: 'Start using search to see powerful analytics and insights',
      icon: BarChart3,
      gradient: 'from-blue-500/30 via-purple-500/30 to-pink-500/30',
      iconGradient: 'from-blue-500/20 via-purple-500/10 to-transparent',
      iconColor: 'text-blue-500',
      tips: [
        {
          icon: TrendingUp,
          title: 'Search Trends',
          description: 'Volume & patterns over time',
          iconBg: 'bg-indigo-500/15',
          iconColor: 'text-indigo-500',
        },
        {
          icon: Activity,
          title: 'User Behavior',
          description: 'What users are searching for',
          iconBg: 'bg-emerald-500/15',
          iconColor: 'text-emerald-500',
        },
        {
          icon: Zap,
          title: 'Performance',
          description: 'Speed & optimization insights',
          iconBg: 'bg-amber-500/15',
          iconColor: 'text-amber-500',
        },
      ],
    },
    performance: {
      title: 'No Performance Data',
      subtitle: 'Search metrics will appear once users start searching',
      icon: Target,
      gradient: 'from-violet-500/30 via-purple-500/30 to-fuchsia-500/30',
      iconGradient: 'from-violet-500/20 via-purple-500/10 to-transparent',
      iconColor: 'text-violet-500',
      tips: [
        {
          icon: Target,
          title: 'Quality Scores',
          description: 'Search quality & success rates',
          iconBg: 'bg-emerald-500/15',
          iconColor: 'text-emerald-500',
        },
        {
          icon: Zap,
          title: 'Response Times',
          description: 'Track search speed',
          iconBg: 'bg-amber-500/15',
          iconColor: 'text-amber-500',
        },
        {
          icon: Brain,
          title: 'Content Gaps',
          description: 'Missing search results',
          iconBg: 'bg-blue-500/15',
          iconColor: 'text-blue-500',
        },
      ],
    },
  };

  const config = content[variant];
  const Icon = config.icon;

  return (
    <div className="flex min-h-[400px] items-center justify-center py-8">
      {/* Glow Card Effect */}
      <div className="group relative w-full max-w-3xl">
        {/* Subtle glow effect */}
        <div className={`absolute -inset-1 rounded-2xl bg-gradient-to-r ${config.gradient} opacity-40 blur-xl transition-all duration-500`} />

        {/* Main Card */}
        <div className="relative rounded-2xl border border-border/50 bg-card/95 backdrop-blur-sm p-10">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              {/* Subtle glow ring */}
              <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${config.iconGradient} blur-xl opacity-50`} />

              {/* Icon container */}
              <div className="relative flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-background to-muted/30 ring-1 ring-border/40 shadow-lg">
                <Icon className={`size-10 ${config.iconColor}`} />
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold tracking-tight mb-2">
              {config.title}
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {config.subtitle}
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid gap-4 md:grid-cols-3 mb-8">
            {config.tips.map((tip, index) => {
              const TipIcon = tip.icon;
              return (
                <div
                  key={index}
                  className="flex flex-col items-center text-center p-5 rounded-xl border border-border/40 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className={`mb-3 flex size-11 items-center justify-center rounded-lg ${tip.iconBg}`}>
                    <TipIcon className={`size-5 ${tip.iconColor}`} />
                  </div>
                  <h3 className="text-sm font-semibold mb-1">{tip.title}</h3>
                  <p className="text-xs text-muted-foreground">{tip.description}</p>
                </div>
              );
            })}
          </div>

          {/* Action Button */}
          {onRefresh && (
            <div className="flex justify-center">
              <Button
                onClick={onRefresh}
                className="h-10 rounded-xl px-6 font-medium shadow-sm"
              >
                <Activity className="mr-2 size-4" />
                Refresh Analytics
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
