import { Badge } from '@/components/ui/badge';
import { CircleCheck, AlertTriangle, CircleX, CircleDashed } from 'lucide-react';
import type { McpStatus } from '../_lib/api-client';

const CONFIG: Record<McpStatus, { label: string; icon: typeof CircleCheck; classes: string }> = {
  healthy: {
    label: 'Healthy',
    icon: CircleCheck,
    classes: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  degraded: {
    label: 'Degraded',
    icon: AlertTriangle,
    classes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  error: {
    label: 'Error',
    icon: CircleX,
    classes: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  },
  unknown: {
    label: 'Unknown',
    icon: CircleDashed,
    classes: 'bg-muted text-muted-foreground border-border',
  },
};

export function McpStatusChip({ status }: { status: McpStatus }) {
  const cfg = CONFIG[status] ?? CONFIG.unknown;
  const Icon = cfg.icon;
  return (
    <Badge className={`${cfg.classes} rounded-lg px-2.5 py-1 text-xs font-semibold border`}>
      <Icon className="mr-1.5 size-3.5" />
      {cfg.label}
    </Badge>
  );
}
