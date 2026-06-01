// app/ai-providers/_components/ProviderStatsBar.tsx

'use client';

import { Server, Cloud, Cpu, Zap } from 'lucide-react';
import type { AIProviderWithModelsResponse } from '@/features/ai-providers';

interface ProviderStatsBarProps {
  providers: AIProviderWithModelsResponse[];
}

export function ProviderStatsBar({ providers }: ProviderStatsBarProps) {
  const totalProviders = providers.length;
  const enabledProviders = providers.filter(p => p.isEnabled).length;
  const cloudProviders = providers.filter(p => p.providerType === 'cloud').length;
  const localProviders = providers.filter(p => p.providerType === 'local').length;
  const totalModels = providers.reduce((sum, p) => sum + (p.models?.length || 0), 0);
  const availableModels = providers.reduce((sum, p) =>
    sum + (p.models?.filter(m => m.isAvailable).length || 0), 0);

  const stats = [
    {
      label: 'Total Providers',
      value: totalProviders,
      subtitle: `${enabledProviders} enabled`,
      icon: Server,
      gradient: 'from-blue-500/20 to-cyan-500/20',
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-500/10',
    },
    {
      label: 'Cloud Providers',
      value: cloudProviders,
      subtitle: 'Remote services',
      icon: Cloud,
      gradient: 'from-purple-500/20 to-pink-500/20',
      iconColor: 'text-purple-600',
      iconBg: 'bg-purple-500/10',
    },
    {
      label: 'Local Providers',
      value: localProviders,
      subtitle: 'Self-hosted',
      icon: Cpu,
      gradient: 'from-green-500/20 to-emerald-500/20',
      iconColor: 'text-green-600',
      iconBg: 'bg-green-500/10',
    },
    {
      label: 'Available Models',
      value: availableModels,
      subtitle: `${totalModels} total`,
      icon: Zap,
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
