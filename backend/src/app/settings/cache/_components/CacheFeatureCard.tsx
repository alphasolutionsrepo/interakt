// app/settings/cache/_components/CacheFeatureCard.tsx

'use client';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Database,
  Layers,
  Bot,
  FileText,
  Trash2,
  Loader2,
  Clock,
  HardDrive,
} from 'lucide-react';
import type { CacheStats, CacheFeatureInfo } from '../_lib/api-client';

interface CacheFeatureCardProps {
  feature: CacheFeatureInfo;
  stats: CacheStats | undefined;
  onClear: () => void;
  isClearing: boolean;
}

const iconMap = {
  database: Database,
  layers: Layers,
  bot: Bot,
  'file-text': FileText,
};

const colorMap = {
  blue: {
    gradient: 'from-blue-500/20 to-cyan-500/20',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-600',
    progressBg: 'bg-blue-100',
    progressFill: 'bg-blue-500',
    badge: 'bg-blue-100 text-blue-700',
  },
  purple: {
    gradient: 'from-purple-500/20 to-pink-500/20',
    iconBg: 'bg-purple-500/10',
    iconColor: 'text-purple-600',
    progressBg: 'bg-purple-100',
    progressFill: 'bg-purple-500',
    badge: 'bg-purple-100 text-purple-700',
  },
  green: {
    gradient: 'from-green-500/20 to-emerald-500/20',
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-600',
    progressBg: 'bg-green-100',
    progressFill: 'bg-green-500',
    badge: 'bg-green-100 text-green-700',
  },
  amber: {
    gradient: 'from-amber-500/20 to-orange-500/20',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-600',
    progressBg: 'bg-amber-100',
    progressFill: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700',
  },
};

function formatTTL(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

export function CacheFeatureCard({
  feature,
  stats,
  onClear,
  isClearing,
}: CacheFeatureCardProps) {
  const Icon = iconMap[feature.icon];
  const colors = colorMap[feature.color];

  const size = stats?.size ?? 0;
  const maxSize = stats?.maxSize ?? 1000;
  const utilizationPercent = maxSize > 0 ? Math.round((size / maxSize) * 100) : 0;
  const ttl = stats?.defaultTTL ?? 300000;
  const pending = stats?.pending ?? 0;

  return (
    <div className="relative group">
      {/* Glow effect */}
      <div
        className={`absolute -inset-0.5 bg-gradient-to-r ${colors.gradient} rounded-2xl blur-lg opacity-0 group-hover:opacity-50 transition-opacity duration-500`}
      />

      {/* Card content */}
      <div className="relative rounded-2xl border border-border/60 bg-card p-6 transition-all duration-300 hover:shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`${colors.iconBg} p-3 rounded-xl`}>
              <Icon className={`size-6 ${colors.iconColor}`} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{feature.name}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-3 rounded-xl bg-muted/50">
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
              <HardDrive className="size-3.5" />
              <span className="text-xs font-medium">Entries</span>
            </div>
            <p className="text-2xl font-bold">{size.toLocaleString()}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-muted/50">
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
              <Clock className="size-3.5" />
              <span className="text-xs font-medium">TTL</span>
            </div>
            <p className="text-2xl font-bold">{formatTTL(ttl)}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-muted/50">
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
              <Loader2 className="size-3.5" />
              <span className="text-xs font-medium">Pending</span>
            </div>
            <p className="text-2xl font-bold">{pending}</p>
          </div>
        </div>

        {/* Utilization Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">Cache Utilization</span>
            <span className="font-medium">{utilizationPercent}%</span>
          </div>
          <Progress value={utilizationPercent} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            {size.toLocaleString()} / {maxSize.toLocaleString()} slots used
          </p>
        </div>

        {/* Clear Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onClear}
          disabled={isClearing || size === 0}
          className="w-full rounded-xl"
        >
          {isClearing ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Clearing...
            </>
          ) : (
            <>
              <Trash2 className="mr-2 size-4" />
              Clear Cache
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
