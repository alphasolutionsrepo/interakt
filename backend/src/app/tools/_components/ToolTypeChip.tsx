'use client';

import { Badge } from '@/components/ui/badge';
import { Database, Globe, Search, Bot, Eye, ListFilter, BookOpen, Terminal } from 'lucide-react';
import type { ExecutorType, DataSourceOperation } from '../_lib/api-client';

// ============================================================================
// CHIP CONFIG
// ============================================================================

export interface ChipConfig {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeClass: string;
  iconClass: string;
  iconBg: string;
  description: string;
}

export const EXECUTOR_TYPE_CONFIG: Record<ExecutorType, ChipConfig> = {
  data_source: {
    label: 'Data Source',
    icon: Database,
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    iconClass: 'text-blue-500',
    iconBg: 'bg-blue-500/10',
    description: 'Operates on a connected data source.',
  },
  http: {
    label: 'HTTP API',
    icon: Globe,
    badgeClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
    iconClass: 'text-teal-500',
    iconBg: 'bg-teal-500/10',
    description: 'Call an external REST API or web service.',
  },
  ai_call: {
    label: 'AI Responder',
    icon: Bot,
    badgeClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
    iconClass: 'text-violet-500',
    iconBg: 'bg-violet-500/10',
    description: 'Sub-LLM call with custom instructions.',
  },
  web_search: {
    label: 'Web Search',
    icon: Globe,
    badgeClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    iconClass: 'text-sky-500',
    iconBg: 'bg-sky-500/10',
    description: 'Search the web for up-to-date information.',
  },
};

export const OPERATION_CONFIG: Record<DataSourceOperation, ChipConfig> = {
  search: {
    label: 'Search',
    icon: Search,
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    iconClass: 'text-blue-500',
    iconBg: 'bg-blue-500/10',
    description: 'Query for ranked results.',
  },
  inspect: {
    label: 'Inspect',
    icon: Eye,
    badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    iconClass: 'text-indigo-500',
    iconBg: 'bg-indigo-500/10',
    description: 'Describe schema and fields.',
  },
  enumerate: {
    label: 'Enumerate',
    icon: ListFilter,
    badgeClass: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
    iconClass: 'text-cyan-500',
    iconBg: 'bg-cyan-500/10',
    description: 'List distinct field values.',
  },
  lookup: {
    label: 'Lookup',
    icon: BookOpen,
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    iconClass: 'text-emerald-500',
    iconBg: 'bg-emerald-500/10',
    description: 'Retrieve document by ID.',
  },
  query: {
    label: 'Query',
    icon: Terminal,
    badgeClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
    iconClass: 'text-orange-500',
    iconBg: 'bg-orange-500/10',
    description: 'Execute a structured query.',
  },
};

// ============================================================================
// RESOLVE CONFIG
// ============================================================================

export function resolveToolChipConfig(tool: {
  executorType?: string | null;
  operation?: string | null;
}): ChipConfig | undefined {
  if (!tool.executorType) return undefined;

  // For data_source, prefer operation-specific config
  if (tool.executorType === 'data_source' && tool.operation) {
    return OPERATION_CONFIG[tool.operation as DataSourceOperation];
  }
  return EXECUTOR_TYPE_CONFIG[tool.executorType as ExecutorType];
}

// ============================================================================
// CHIP COMPONENT
// ============================================================================

interface ToolTypeChipProps {
  executorType?: ExecutorType | string | null;
  operation?: DataSourceOperation | string | null;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export function ToolTypeChip({ executorType, operation, showIcon = true, size = 'md' }: ToolTypeChipProps) {
  const config = resolveToolChipConfig({ executorType, operation });
  const displayLabel = config?.label ?? executorType ?? operation ?? 'Unknown';

  if (!config) {
    return <Badge variant="outline" className="rounded-lg">{displayLabel}</Badge>;
  }

  const Icon = config.icon;

  return (
    <Badge
      className={`${config.badgeClass} rounded-lg font-semibold ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      }`}
    >
      {showIcon && <Icon className={`mr-1.5 ${size === 'sm' ? 'size-3' : 'size-3.5'}`} />}
      {config.label}
    </Badge>
  );
}
