// app/playground/ai-service/_components/UsageStats.tsx

'use client';

/**
 * Usage Stats Component
 * 
 * Displays token usage and metadata for AI operations.
 */

import { Badge } from '@/components/ui/badge';
import {
  Clock,
  Hash,
  ArrowDownToLine,
  ArrowUpFromLine,
  Server,
  Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TokenUsage } from '../_lib/api-client';

interface UsageStatsProps {
  usage: TokenUsage;
  metadata: {
    requestId: string;
    provider: string;
    model: string;
    durationMs: number;
    finishReason?: string;
    dimensions?: number;
    batchSize?: number;
  };
  compact?: boolean;
  className?: string;
}

export function UsageStats({
  usage,
  metadata,
  compact = false,
  className,
}: UsageStatsProps) {
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  if (compact) {
    return (
      <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground', className)}>
        <span className="flex items-center gap-1.5">
          <Hash className="h-3.5 w-3.5" />
          {usage.totalTokens.toLocaleString()} tokens
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {formatDuration(metadata.durationMs)}
        </span>
        <span className="flex items-center gap-1.5">
          <Server className="h-3.5 w-3.5" />
          {metadata.provider} / {metadata.model}
        </span>
      </div>
    );
  }

  return (
    <div className={cn(
      'rounded-lg border bg-muted/30 p-4',
      className
    )}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatItem
          icon={ArrowDownToLine}
          label="Input"
          value={usage.inputTokens.toLocaleString()}
          iconClass="text-blue-500"
        />
        <StatItem
          icon={ArrowUpFromLine}
          label="Output"
          value={usage.outputTokens.toLocaleString()}
          iconClass="text-green-500"
        />
        <StatItem
          icon={Hash}
          label="Total"
          value={usage.totalTokens.toLocaleString()}
          iconClass="text-purple-500"
        />
        <StatItem
          icon={Clock}
          label="Duration"
          value={formatDuration(metadata.durationMs)}
          iconClass="text-orange-500"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Server className="h-3.5 w-3.5" />
          {metadata.provider}
        </span>
        <span className="flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5" />
          {metadata.model}
        </span>
        {metadata.finishReason && (
          <Badge variant="secondary" className="text-[10px]">
            {metadata.finishReason}
          </Badge>
        )}
        {metadata.dimensions && (
          <span>{metadata.dimensions}d</span>
        )}
      </div>
    </div>
  );
}

function StatItem({ 
  icon: Icon, 
  label, 
  value, 
  iconClass 
}: { 
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  iconClass?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5', iconClass)} />
        <span>{label}</span>
      </div>
      <p className="text-lg font-semibold font-mono">{value}</p>
    </div>
  );
}