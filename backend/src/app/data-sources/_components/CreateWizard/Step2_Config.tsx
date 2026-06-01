'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAllActiveSearchIndexes } from '@/app/search-indexes/_lib/hooks/useSearchIndexes';
import type { DataSourceType } from '../../_lib/api-client';

interface Step2Props {
  dataSourceType: DataSourceType;
  value: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  errors: Record<string, string>;
}

// ============================================================================
// SEARCH INDEX CONFIG
// ============================================================================

function SearchIndexConfig({ value, onChange, errors }: Omit<Step2Props, 'dataSourceType'>) {
  const { data: indexes, isLoading } = useAllActiveSearchIndexes();

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label>
          Search Index <span className="text-destructive">*</span>
        </Label>
        <p className="text-xs text-muted-foreground mb-2">
          Select an existing search index to connect as a data source.
        </p>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
            <Loader2 className="size-4 animate-spin" /> Loading indexes...
          </div>
        ) : indexes && indexes.length > 0 ? (
          <Select
            value={(value.searchIndexId as string) || ''}
            onValueChange={(v) => onChange({ ...value, searchIndexId: v })}
          >
            <SelectTrigger className={`rounded-xl ${errors.searchIndexId ? 'border-destructive' : ''}`}>
              <SelectValue placeholder="Choose a search index..." />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {indexes.map((idx) => (
                <SelectItem key={idx.id} value={idx.id} className="rounded-lg">
                  <div className="flex flex-col">
                    <span className="font-medium">{idx.displayName || idx.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{idx.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3 px-4 rounded-xl border border-border/60 bg-muted/30">
            <AlertCircle className="size-4 shrink-0" />
            No active search indexes found. Create one first.
          </div>
        )}
        {errors.searchIndexId && <p className="text-xs text-destructive">{errors.searchIndexId}</p>}
      </div>
    </div>
  );
}

// ============================================================================
// EXTERNAL SEARCH INDEX CONFIG
// ============================================================================

function ExternalSearchIndexConfig({ value, onChange, errors }: Omit<Step2Props, 'dataSourceType'>) {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label>
          Provider <span className="text-destructive">*</span>
        </Label>
        <Select
          value={((value.connection as Record<string, unknown>)?.provider as string) || ''}
          onValueChange={(v) => onChange({
            ...value,
            connection: { ...(value.connection as Record<string, unknown> || {}), provider: v },
          })}
        >
          <SelectTrigger className={`rounded-xl ${errors.provider ? 'border-destructive' : ''}`}>
            <SelectValue placeholder="Select provider..." />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {[
              { value: 'elasticsearch', label: 'Elasticsearch' },
              { value: 'azure_ai_search', label: 'Azure AI Search' },
            ].map((p) => (
              <SelectItem key={p.value} value={p.value} className="rounded-lg">
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.provider && <p className="text-xs text-destructive">{errors.provider}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>
          Connection URL <span className="text-destructive">*</span>
        </Label>
        <Input
          value={((value.connection as Record<string, unknown>)?.url as string) || ''}
          onChange={(e) => onChange({
            ...value,
            connection: { ...(value.connection as Record<string, unknown> || {}), url: e.target.value },
          })}
          placeholder="https://your-cluster.example.com"
          className={`rounded-xl ${errors.url ? 'border-destructive' : ''}`}
        />
        {errors.url && <p className="text-xs text-destructive">{errors.url}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>
          Index Name <span className="text-destructive">*</span>
        </Label>
        <Input
          value={((value.connection as Record<string, unknown>)?.indexName as string) || ''}
          onChange={(e) => onChange({
            ...value,
            connection: { ...(value.connection as Record<string, unknown> || {}), indexName: e.target.value },
          })}
          placeholder="products"
          className={`rounded-xl font-mono ${errors.indexName ? 'border-destructive' : ''}`}
        />
        {errors.indexName && <p className="text-xs text-destructive">{errors.indexName}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Auth Type</Label>
        <Select
          value={((value.connection as Record<string, unknown>)?.authType as string) || 'api_key'}
          onValueChange={(v) => onChange({
            ...value,
            connection: { ...(value.connection as Record<string, unknown> || {}), authType: v },
          })}
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {['api_key', 'basic', 'bearer', 'none'].map((t) => (
              <SelectItem key={t} value={t} className="rounded-lg capitalize">{t.replace('_', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Secret Reference</Label>
        <Input
          value={((value.connection as Record<string, unknown>)?.credentials as Record<string, unknown>)?.secretRef as string || ''}
          onChange={(e) => onChange({
            ...value,
            connection: {
              ...(value.connection as Record<string, unknown> || {}),
              credentials: { secretRef: e.target.value },
            },
          })}
          placeholder="e.g. azure_search_key"
          className="rounded-xl font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Name of the secret stored in the <a href="/secrets" className="underline hover:text-foreground" target="_blank">Secrets Vault</a>.
          Create the secret first, then reference it by name here.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// PLACEHOLDER CONFIGS (Phase 2/3)
// ============================================================================

function ComingSoonConfig({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground px-4 py-3 rounded-xl border border-border/60 bg-muted/30">
        <AlertCircle className="size-4 shrink-0" />
        {label} configuration is coming in a future phase. Basic setup available now.
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function Step2_Config({ dataSourceType, value, onChange, errors }: Step2Props) {
  switch (dataSourceType) {
    case 'search_index':
      return <SearchIndexConfig value={value} onChange={onChange} errors={errors} />;
    case 'search_index_external':
      return <ExternalSearchIndexConfig value={value} onChange={onChange} errors={errors} />;
    case 'file_store':
      return <ComingSoonConfig label="File Store" />;
    case 'database':
      return <ComingSoonConfig label="Database" />;
    default:
      return null;
  }
}
