'use client';

import { Badge } from '@/components/ui/badge';
import { CircleCheck, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import type { DataSourceStatus } from '../_lib/api-client';

const HEALTH_CONFIG: Record<DataSourceStatus, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}> = {
  healthy: {
    label: 'Healthy',
    icon: CircleCheck,
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  degraded: {
    label: 'Degraded',
    icon: AlertTriangle,
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  error: {
    label: 'Error',
    icon: XCircle,
    className: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  },
  unknown: {
    label: 'Unknown',
    icon: HelpCircle,
    className: 'bg-muted text-muted-foreground border-border/50',
  },
};

interface HealthStatusChipProps {
  status: DataSourceStatus | string;
}

export function HealthStatusChip({ status }: HealthStatusChipProps) {
  const config = HEALTH_CONFIG[status as DataSourceStatus] ?? HEALTH_CONFIG.unknown;
  const Icon = config.icon;

  return (
    <Badge className={`${config.className} rounded-lg px-2.5 py-1 text-xs font-semibold`}>
      <Icon className="mr-1.5 size-3.5" /> {config.label}
    </Badge>
  );
}
