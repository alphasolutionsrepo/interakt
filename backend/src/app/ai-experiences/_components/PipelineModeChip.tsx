'use client';

import { Badge } from '@/components/ui/badge';
import { Bot, GitBranch } from 'lucide-react';

export const PIPELINE_MODE_CONFIG = {
  agentic: {
    label: 'Agentic',
    icon: Bot,
    badgeClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
    iconClass: 'text-violet-500',
    iconBg: 'bg-violet-500/10',
    description: 'LLM dynamically decides which tools to use and when.',
  },
  deterministic: {
    label: 'Deterministic',
    icon: GitBranch,
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    iconClass: 'text-blue-500',
    iconBg: 'bg-blue-500/10',
    description: 'Predefined tool execution order. Predictable and fast.',
  },
};

interface PipelineModeChipProps {
  mode: string;
  showIcon?: boolean;
}

export function PipelineModeChip({ mode, showIcon = true }: PipelineModeChipProps) {
  const config = PIPELINE_MODE_CONFIG[mode as keyof typeof PIPELINE_MODE_CONFIG];
  if (!config) return <Badge variant="outline" className="rounded-lg">{mode}</Badge>;
  const Icon = config.icon;
  return (
    <Badge className={`${config.badgeClass} rounded-lg px-2.5 py-1 text-xs font-semibold`}>
      {showIcon && <Icon className="mr-1.5 size-3.5" />}
      {config.label}
    </Badge>
  );
}
