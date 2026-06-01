'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Database, ChevronDown, ChevronUp, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { parseAzureIndexSchema } from '../../../_lib/azure-schema-parser';
import type { DataSourceMeta } from '../Step2_Config';

// ============================================================================
// TYPES
// ============================================================================

interface DataSource {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  config: Record<string, unknown>;
  status: string;
  isActive: boolean;
  documentCount: number | null;
  schema: Record<string, unknown> | null;
}

interface SearchProviderConfigProps {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  errors?: Record<string, string>;
  onSchemaImport?: (outputSchema: object) => void;
  onDataSourceSelected?: (meta: DataSourceMeta) => void;
}

// ============================================================================
// DATA SOURCE STATUS BADGE
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    degraded: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    error: 'bg-destructive/10 text-destructive border-destructive/20',
    unknown: 'bg-muted text-muted-foreground border-border/50',
  };
  return (
    <Badge variant="outline" className={`rounded-md text-[10px] px-1.5 py-0 ${colors[status] ?? colors.unknown}`}>
      {status}
    </Badge>
  );
}

// ============================================================================
// COMMON OPTIONS
// ============================================================================

function CommonOptions({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (key: string, val: unknown) => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Defaults</p>

      {/* Max Results */}
      <div className="space-y-1.5">
        <Label>Default Max Results</Label>
        <Input
          type="number"
          min={1}
          max={100}
          value={(value.maxResults as number) ?? ''}
          onChange={(e) => onChange('maxResults', e.target.value ? Number(e.target.value) : undefined)}
          placeholder="10"
          className="rounded-xl"
        />
        <p className="text-xs text-muted-foreground">
          Number of results returned per search. The AI cannot override this.
        </p>
      </div>

      {/* Response Fields */}
      <div className="space-y-1.5">
        <Label>Response Fields</Label>
        <Input
          type="text"
          value={((value.responseFields as string[]) ?? []).join(', ')}
          onChange={(e) => {
            const raw = e.target.value;
            const fields = raw ? raw.split(',').map((f: string) => f.trim()).filter(Boolean) : undefined;
            onChange('responseFields', fields?.length ? fields : undefined);
          }}
          placeholder="name, brand, price, category, shortDescription"
          className="rounded-xl"
        />
        <p className="text-xs text-muted-foreground">
          Comma-separated list of fields to include in results. Reduces token usage for AI synthesis. Leave empty to return all fields.
        </p>
      </div>

      {/* Include Highlights */}
      <div className="space-y-1.5">
        <Label>Include Highlights</Label>
        <button
          type="button"
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
            value.includeHighlights !== false
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'border-border/60 bg-background text-muted-foreground'
          }`}
          onClick={() => onChange('includeHighlights', value.includeHighlights === false ? undefined : false)}
        >
          <span className={`inline-block size-3 rounded-sm border ${
            value.includeHighlights !== false
              ? 'border-emerald-500 bg-emerald-500'
              : 'border-muted-foreground'
          }`} />
          {value.includeHighlights !== false ? 'Enabled' : 'Disabled'}
        </button>
        <p className="text-xs text-muted-foreground">
          Return highlighted snippets with search matches. Disable to reduce token usage when highlights aren&apos;t needed for the response.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// AZURE SCHEMA IMPORT PANEL
// ============================================================================

function AzureSchemaImportPanel({ onImport }: { onImport: (schema: object) => void }) {
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState('');
  const [result, setResult] = useState<
    | { ok: true; fieldCount: number; skippedCount: number; indexName?: string }
    | { ok: false; error: string }
    | null
  >(null);

  function handleParse() {
    if (!json.trim()) return;
    const parsed = parseAzureIndexSchema(json);
    if ('error' in parsed) {
      setResult({ ok: false, error: parsed.error });
    } else {
      setResult({ ok: true, fieldCount: parsed.fieldCount, skippedCount: parsed.skippedCount, indexName: parsed.indexName });
      onImport(parsed.outputSchema);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-muted/10">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-orange-500" />
          <span className="text-sm font-medium">Auto-generate output schema from Azure index JSON</span>
        </div>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/60 px-4 pb-4 pt-3">
          <p className="text-xs text-muted-foreground">
            Paste the full index definition JSON from the Azure portal or the{' '}
            <code className="bg-muted px-1 rounded text-[11px]">GET /indexes/&#123;name&#125;</code> REST API response.
            Fields will be mapped to a typed output schema automatically.
          </p>
          <Textarea
            value={json}
            onChange={(e) => { setJson(e.target.value); setResult(null); }}
            placeholder={'{\n  "name": "my-index",\n  "fields": [ ... ]\n}'}
            className="rounded-xl font-mono text-xs min-h-[120px] resize-y"
          />

          {result?.ok === true && (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4 mt-0.5 shrink-0" />
              <span>
                Schema applied{result.indexName ? ` for index "${result.indexName}"` : ''}.{' '}
                {result.fieldCount} field{result.fieldCount !== 1 ? 's' : ''} mapped
                {result.skippedCount > 0 ? `, ${result.skippedCount} skipped (vector/non-retrievable)` : ''}.{' '}
                Check the <strong>AI Settings</strong> step to review or edit.
              </span>
            </div>
          )}
          {result?.ok === false && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <span>{result.error}</span>
            </div>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-xl"
            disabled={!json.trim()}
            onClick={handleParse}
          >
            <Sparkles className="size-3.5 mr-1.5" />
            Parse &amp; Apply Schema
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SearchProviderConfig({ value, onChange, errors, onSchemaImport, onDataSourceSelected }: SearchProviderConfigProps) {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch active data sources (search_index and search_index_external types)
  useEffect(() => {
    fetch('/api/data-sources?isActive=true&pageSize=100')
      .then((r) => r.json())
      .then((json) => setDataSources((json.data ?? []) as DataSource[]))
      .catch(() => setDataSources([]))
      .finally(() => setLoading(false));
  }, []);

  const selectedId = value.dataSourceId as string | undefined;
  const selectedDs = dataSources.find((ds) => ds.id === selectedId);

  function handleSelectDataSource(dsId: string) {
    const ds = dataSources.find((d) => d.id === dsId);
    // Preserve query options, set dataSourceId
    const { maxResults, responseFields, includeHighlights: includeHL, includeFacets, facetFields, boostFields, defaultFilters } = value;
    onChange({ dataSourceId: dsId, maxResults, responseFields, includeHighlights: includeHL, includeFacets, facetFields, boostFields, defaultFilters });

    // Notify parent wizard to auto-populate name/slug/description
    if (ds && onDataSourceSelected) {
      onDataSourceSelected({
        name: ds.name,
        slug: ds.slug,
        description: ds.description,
        type: ds.type,
      });
    }
  }

  function set(key: string, val: unknown) {
    onChange({ ...value, [key]: val });
  }

  // Determine if the selected data source is azure-based (for schema import)
  const dsConfig = selectedDs?.config as Record<string, unknown> | undefined;
  const isAzure = selectedDs?.type === 'search_index_external' &&
    (dsConfig?.provider === 'azure_ai_search');

  return (
    <div className="space-y-5">
      {/* Data Source Selector */}
      <div className="space-y-1.5">
        <Label>Data Source <span className="text-destructive">*</span></Label>
        <Select
          value={selectedId ?? ''}
          onValueChange={handleSelectDataSource}
          disabled={loading}
        >
          <SelectTrigger className={`rounded-xl ${errors?.dataSourceId ? 'border-destructive' : ''}`}>
            <SelectValue placeholder={loading ? 'Loading data sources…' : 'Select a data source'} />
          </SelectTrigger>
          <SelectContent>
            {dataSources.length === 0 && !loading && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No active data sources found.{' '}
                <a href="/data-sources/new" className="underline hover:text-foreground" target="_blank">
                  Create one first
                </a>.
              </div>
            )}
            {dataSources.map((ds) => (
              <SelectItem key={ds.id} value={ds.id}>
                <div className="flex items-center gap-2">
                  <Database className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{ds.name}</span>
                  <StatusBadge status={ds.status} />
                  {ds.documentCount != null && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">{ds.documentCount.toLocaleString()} docs</span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors?.dataSourceId && (
          <p className="text-xs text-destructive">{errors.dataSourceId}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Choose the data source this tool will search. Data sources are created in the{' '}
          <a href="/data-sources" className="underline hover:text-foreground" target="_blank">Data Sources</a> section.
        </p>
      </div>

      {/* Selected data source info */}
      {selectedDs && (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-blue-500" />
              <span className="text-sm font-semibold">{selectedDs.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={selectedDs.status} />
              <Badge variant="outline" className="rounded-md text-[10px] px-1.5 py-0">
                {selectedDs.type.replace(/_/g, ' ')}
              </Badge>
            </div>
          </div>
          {selectedDs.description && (
            <p className="text-xs text-muted-foreground">{selectedDs.description}</p>
          )}
          <div className="flex gap-4 text-xs text-muted-foreground">
            {selectedDs.documentCount != null && (
              <span>{selectedDs.documentCount.toLocaleString()} documents</span>
            )}
            {selectedDs.schema && (
              <span>{((selectedDs.schema as Record<string, unknown>).fields as unknown[])?.length ?? 0} fields discovered</span>
            )}
          </div>
        </div>
      )}

      {/* Azure schema import — for azure data sources */}
      {isAzure && onSchemaImport && (
        <AzureSchemaImportPanel onImport={onSchemaImport} />
      )}

      {/* Common query options — always shown */}
      <CommonOptions value={value} onChange={set} />
    </div>
  );
}
