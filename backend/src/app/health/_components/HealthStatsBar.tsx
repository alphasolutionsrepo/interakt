// app/health/_components/HealthStatsBar.tsx

'use client';

import { CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';
import type { SystemHealth } from '../_lib/api-client';

interface HealthStatsBarProps {
  health: SystemHealth | undefined;
}

export function HealthStatsBar({ health }: HealthStatsBarProps) {
  if (!health) {
    return null;
  }

  const healthyCount = health.services.filter(s => s.status === 'healthy').length;
  const degradedCount = health.services.filter(s => s.status === 'degraded').length;
  const unhealthyCount = health.services.filter(s => s.status === 'unhealthy').length;

  // Calculate average response time
  const avgResponseTime = health.services.length > 0
    ? Math.round(health.services.reduce((sum, s) => sum + s.responseTime, 0) / health.services.length)
    : 0;

  const stats = [
    {
      label: 'Overall Status',
      value: health.status.charAt(0).toUpperCase() + health.status.slice(1),
      subtitle: `${healthyCount}/${health.services.length} services healthy`,
      icon: health.status === 'healthy' ? CheckCircle2 : health.status === 'degraded' ? AlertTriangle : XCircle,
      gradient: health.status === 'healthy'
        ? 'from-green-500/20 to-emerald-500/20'
        : health.status === 'degraded'
        ? 'from-amber-500/20 to-orange-500/20'
        : 'from-red-500/20 to-rose-500/20',
      iconColor: health.status === 'healthy'
        ? 'text-green-600'
        : health.status === 'degraded'
        ? 'text-amber-600'
        : 'text-red-600',
      iconBg: health.status === 'healthy'
        ? 'bg-green-500/10'
        : health.status === 'degraded'
        ? 'bg-amber-500/10'
        : 'bg-red-500/10',
    },
    {
      label: 'Healthy Services',
      value: healthyCount,
      subtitle: 'Operating normally',
      icon: CheckCircle2,
      gradient: 'from-green-500/20 to-emerald-500/20',
      iconColor: 'text-green-600',
      iconBg: 'bg-green-500/10',
    },
    {
      label: 'Issues Detected',
      value: degradedCount + unhealthyCount,
      subtitle: `${degradedCount} degraded, ${unhealthyCount} failed`,
      icon: AlertTriangle,
      gradient: 'from-amber-500/20 to-orange-500/20',
      iconColor: 'text-amber-600',
      iconBg: 'bg-amber-500/10',
    },
    {
      label: 'Avg Response Time',
      value: `${avgResponseTime}ms`,
      subtitle: 'Health check latency',
      icon: Clock,
      gradient: 'from-purple-500/20 to-pink-500/20',
      iconColor: 'text-purple-600',
      iconBg: 'bg-purple-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div key={stat.label} className="relative group">
            {/* Glow effect */}
            <div
              className={`absolute -inset-0.5 bg-gradient-to-r ${stat.gradient} rounded-2xl blur-lg opacity-0 group-hover:opacity-70 transition-opacity duration-500`}
            />

            {/* Card content */}
            <div className="relative rounded-2xl border border-border/60 bg-card p-6 transition-all duration-300 hover:shadow-xl">
              <div className="flex items-center gap-5">
                <div className={`${stat.iconBg} p-4 rounded-2xl shrink-0`}>
                  <Icon className={`size-8 ${stat.iconColor}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                    {stat.label}
                  </p>
                  <h3 className="text-2xl font-bold tracking-tight truncate mb-1">
                    {stat.value}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate">
                    {stat.subtitle}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
