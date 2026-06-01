'use client';

import { Badge } from '@/components/ui/badge';
import { Database, Globe, FileText, Server } from 'lucide-react';
import type { DataSourceType } from '../_lib/api-client';

export const DS_TYPE_CONFIG = {
  search_index: {
    label: 'Search Index',
    icon: Database,
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    iconClass: 'text-blue-500',
    iconBg: 'bg-blue-500/10',
    description: 'Internal search index managed by the platform.',
  },
  search_index_external: {
    label: 'External Index',
    icon: Globe,
    badgeClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
    iconClass: 'text-teal-500',
    iconBg: 'bg-teal-500/10',
    description: 'External search engine (Elasticsearch or Azure AI Search).',
  },
  file_store: {
    label: 'File Store',
    icon: FileText,
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    iconClass: 'text-amber-500',
    iconBg: 'bg-amber-500/10',
    description: 'Document files with chunking and embeddings.',
  },
  database: {
    label: 'Database',
    icon: Server,
    badgeClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
    iconClass: 'text-violet-500',
    iconBg: 'bg-violet-500/10',
    description: 'Structured database with query templates.',
  },
} satisfies Record<DataSourceType, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeClass: string;
  iconClass: string;
  iconBg: string;
  description: string;
}>;

interface DataSourceTypeChipProps {
  type: DataSourceType | string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export function DataSourceTypeChip({ type, showIcon = true, size = 'md' }: DataSourceTypeChipProps) {
  const config = DS_TYPE_CONFIG[type as DataSourceType];
  if (!config) return <Badge variant="outline" className="rounded-lg">{type}</Badge>;

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
