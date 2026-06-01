// app/settings/cache/_components/CacheStatsGrid.tsx

'use client';

import { Database, Layers, Clock, Zap } from 'lucide-react';

interface CacheStatsGridProps {
  totalEntries: number;
  totalMaxSize: number;
  totalPending: number;
  featuresCount: number;
}

export function CacheStatsGrid({
  totalEntries,
  totalMaxSize,
  totalPending,
  featuresCount,
}: CacheStatsGridProps) {
  const utilizationPercent = totalMaxSize > 0
    ? Math.round((totalEntries / totalMaxSize) * 100)
    : 0;

  const stats = [
    {
      label: 'Cached Entries',
      value: totalEntries.toLocaleString(),
      subtitle: `${utilizationPercent}% utilized`,
      icon: Database,
      gradient: 'from-blue-500/20 to-cyan-500/20',
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-500/10',
    },
    {
      label: 'Max Capacity',
      value: totalMaxSize.toLocaleString(),
      subtitle: 'Total slots',
      icon: Layers,
      gradient: 'from-purple-500/20 to-pink-500/20',
      iconColor: 'text-purple-600',
      iconBg: 'bg-purple-500/10',
    },
    {
      label: 'Active Features',
      value: featuresCount,
      subtitle: 'Cache instances',
      icon: Zap,
      gradient: 'from-green-500/20 to-emerald-500/20',
      iconColor: 'text-green-600',
      iconBg: 'bg-green-500/10',
    },
    {
      label: 'Pending Requests',
      value: totalPending,
      subtitle: 'In-flight',
      icon: Clock,
      gradient: 'from-amber-500/20 to-orange-500/20',
      iconColor: 'text-amber-600',
      iconBg: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    {stat.label}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-4xl font-bold tracking-tight">
                      {stat.value}
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.subtitle}
                  </p>
                </div>

                <div className={`${stat.iconBg} p-3 rounded-xl`}>
                  <Icon className={`size-6 ${stat.iconColor}`} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
