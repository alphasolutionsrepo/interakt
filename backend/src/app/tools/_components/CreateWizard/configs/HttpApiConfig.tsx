'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Check, ChevronDown, ChevronUp, FileJson, Plus, Trash2 } from 'lucide-react';

interface HttpApiConfigProps {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  errors?: Record<string, string>;
}

interface KVPair {
  key: string;
  value: string;
}

// ============================================================================
// KV EDITOR
// ============================================================================

function KVEditor({
  label,
  hint,
  pairs,
  onChange,
}: {
  label: string;
  hint?: string;
  pairs: KVPair[];
  onChange: (pairs: KVPair[]) => void;
}) {
  function addRow() {
    onChange([...pairs, { key: '', value: '' }]);
  }
  function removeRow(i: number) {
    onChange(pairs.filter((_, idx) => idx !== i));
  }
  function updateRow(i: number, field: 'key' | 'value', val: string) {
    const next = [...pairs];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button type="button" variant="ghost" size="sm" className="rounded-lg h-7 text-xs gap-1" onClick={addRow}>
          <Plus className="size-3" />
          Add
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {pairs.length > 0 && (
        <div className="space-y-2">
          {pairs.map((pair, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                value={pair.key}
                onChange={(e) => updateRow(i, 'key', e.target.value)}
                placeholder="Key"
                className="rounded-xl font-mono text-sm flex-1"
              />
              <Input
                value={pair.value}
                onChange={(e) => updateRow(i, 'value', e.target.value)}
                placeholder="Value or {{secret:name}}"
                className="rounded-xl font-mono text-sm flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 size-9 rounded-lg text-muted-foreground hover:text-destructive"
                onClick={() => removeRow(i)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function pairsToRecord(pairs: KVPair[]): Record<string, string> {
  return Object.fromEntries(pairs.filter((p) => p.key).map((p) => [p.key, p.value]));
}

function recordToPairs(record: unknown): KVPair[] {
  if (!record || typeof record !== 'object') return [];
  return Object.entries(record as Record<string, string>).map(([key, value]) => ({ key, value }));
}

// ============================================================================
// JSON IMPORT PANEL
// ============================================================================

function JsonImportPanel({
  onApply,
}: {
  onApply: (config: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  function handleApply() {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      setError('Invalid JSON — check for missing commas or brackets.');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setError('Expected a JSON object, not an array or primitive.');
      return;
    }
    onApply(parsed as Record<string, unknown>);
    setApplied(true);
    setTimeout(() => {
      setApplied(false);
      setOpen(false);
      setRaw('');
    }, 1200);
  }

  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        <FileJson className="size-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium flex-1">Paste JSON config</span>
        <span className="text-xs text-muted-foreground">Fill all fields at once</span>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Paste a config JSON object — all recognised fields will be applied and the form will update.
            You can still edit individual fields afterwards.
          </p>
          <Textarea
            value={raw}
            onChange={(e) => { setRaw(e.target.value); setError(null); }}
            placeholder={`{\n  "baseUrl": "https://api.example.com/search",\n  "method": "GET",\n  "queryParams": { "q": "{{input.query}}" },\n  "responseMapping": { "resultsPath": "$.results[*]", "totalCountPath": "$.total" }\n}`}
            rows={8}
            className="rounded-xl font-mono text-xs resize-none"
            spellCheck={false}
          />
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              className="rounded-xl gap-1.5"
              onClick={handleApply}
              disabled={!raw.trim() || applied}
            >
              {applied
                ? <><Check className="size-3.5" />Applied</>
                : 'Apply Config'
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function HttpApiConfig({ value, onChange, errors }: HttpApiConfigProps) {
  const [headerPairs, setHeaderPairs] = useState<KVPair[]>(() =>
    recordToPairs(value.headers)
  );
  const [queryParamPairs, setQueryParamPairs] = useState<KVPair[]>(() =>
    recordToPairs(value.queryParams)
  );

  function set(key: string, val: unknown) {
    onChange({ ...value, [key]: val });
  }

  function updateHeaders(pairs: KVPair[]) {
    setHeaderPairs(pairs);
    set('headers', pairs.length ? pairsToRecord(pairs) : undefined);
  }

  function updateQueryParams(pairs: KVPair[]) {
    setQueryParamPairs(pairs);
    set('queryParams', pairs.length ? pairsToRecord(pairs) : undefined);
  }

  function setNested(parent: string, key: string, val: unknown) {
    const parentObj = (value[parent] as Record<string, unknown>) ?? {};
    onChange({ ...value, [parent]: { ...parentObj, [key]: val } });
  }

  // When JSON is applied, update both the parent value AND the local KV pair state
  function handleJsonApply(config: Record<string, unknown>) {
    const newHeaders = recordToPairs(config.headers);
    const newQueryParams = recordToPairs(config.queryParams);
    setHeaderPairs(newHeaders);
    setQueryParamPairs(newQueryParams);
    onChange(config);
  }

  const auth = (value.authentication as Record<string, unknown>) ?? { type: 'none' };
  const responseMapping = (value.responseMapping as Record<string, unknown>) ?? {};

  return (
    <div className="space-y-6">
      {/* JSON Import */}
      <JsonImportPanel onApply={handleJsonApply} />

      {/* Base URL + Method */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2 space-y-1.5">
          <Label>
            Base URL <span className="text-destructive">*</span>
          </Label>
          <Input
            value={(value.baseUrl as string) || ''}
            onChange={(e) => set('baseUrl', e.target.value)}
            placeholder="https://api.example.com/search"
            className={`rounded-xl font-mono text-sm ${errors?.baseUrl ? 'border-destructive' : ''}`}
          />
          {errors?.baseUrl && <p className="text-xs text-destructive">{errors.baseUrl}</p>}
          <p className="text-xs text-muted-foreground">
            Supports <code className="font-mono bg-muted px-1 rounded text-[11px]">{'{{secret:name}}'}</code> and{' '}
            <code className="font-mono bg-muted px-1 rounded text-[11px]">{'{{input.field}}'}</code> templates.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Method <span className="text-destructive">*</span></Label>
          <Select
            value={(value.method as string) || 'GET'}
            onValueChange={(v) => set('method', v)}
          >
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="POST">POST</SelectItem>
              <SelectItem value="PUT">PUT</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Headers */}
      <KVEditor
        label="Headers"
        hint="e.g. Content-Type: application/json or Authorization: Bearer {{secret:token}}"
        pairs={headerPairs}
        onChange={updateHeaders}
      />

      {/* Query Params */}
      <KVEditor
        label="Query Parameters"
        hint="Appended to the URL. Supports {{input.field}} templates."
        pairs={queryParamPairs}
        onChange={updateQueryParams}
      />

      {/* Body Template */}
      <div className="space-y-1.5">
        <Label>Body Template (JSON)</Label>
        <Textarea
          value={value.bodyTemplate ? JSON.stringify(value.bodyTemplate, null, 2) : ''}
          onChange={(e) => {
            try {
              const parsed = e.target.value ? JSON.parse(e.target.value) : null;
              set('bodyTemplate', parsed);
            } catch {
              // Let user keep typing
            }
          }}
          placeholder={`{\n  "query": "{{input.searchTerm}}",\n  "filters": "{{input.filters}}"\n}`}
          rows={4}
          className="rounded-xl font-mono text-sm resize-none"
        />
        <p className="text-xs text-muted-foreground">
          Optional JSON body for POST/PUT requests. Use <code className="font-mono bg-muted px-1 rounded text-[11px]">{'{{input.field}}'}</code> templates.
        </p>
      </div>

      {/* Authentication */}
      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4">
        <Label className="text-sm font-semibold">Authentication</Label>
        <Select
          value={(auth.type as string) || 'none'}
          onValueChange={(v) => onChange({ ...value, authentication: { ...auth, type: v } })}
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="header">Header</SelectItem>
            <SelectItem value="query_param">Query Parameter</SelectItem>
          </SelectContent>
        </Select>
        {auth.type !== 'none' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Header / Param Name</Label>
              <Input
                value={(auth.key as string) || ''}
                onChange={(e) => setNested('authentication', 'key', e.target.value)}
                placeholder="Authorization"
                className="rounded-xl text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Secret Reference</Label>
              <Input
                value={(auth.valueRef as string) || ''}
                onChange={(e) => setNested('authentication', 'valueRef', e.target.value)}
                placeholder="my_api_key"
                className="rounded-xl font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Secret name (without <code className="font-mono bg-muted px-1 rounded">{'{{secret:…}}'}</code>)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Response Mapping */}
      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4">
        <Label className="text-sm font-semibold">Response Mapping</Label>
        <div className="space-y-1.5">
          <Label className="text-xs">
            Results Path <span className="text-destructive">*</span>
          </Label>
          <Input
            value={(responseMapping.resultsPath as string) || ''}
            onChange={(e) => setNested('responseMapping', 'resultsPath', e.target.value)}
            placeholder="$.data.results[*]"
            className={`rounded-xl font-mono text-sm ${errors?.['responseMapping.resultsPath'] ? 'border-destructive' : ''}`}
          />
          <p className="text-xs text-muted-foreground">JSONPath expression to extract the results array.</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Total Count Path</Label>
          <Input
            value={(responseMapping.totalCountPath as string) || ''}
            onChange={(e) => setNested('responseMapping', 'totalCountPath', e.target.value || undefined)}
            placeholder="$.data.totalCount"
            className="rounded-xl font-mono text-sm"
          />
        </div>
      </div>

      {/* Timeout + Retries */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Timeout (ms)</Label>
          <Input
            type="number"
            min={1000}
            max={30000}
            value={(value.timeout as number) ?? ''}
            onChange={(e) => set('timeout', e.target.value ? Number(e.target.value) : undefined)}
            placeholder="5000"
            className="rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Retries</Label>
          <Input
            type="number"
            min={0}
            max={3}
            value={(value.retries as number) ?? ''}
            onChange={(e) => set('retries', e.target.value ? Number(e.target.value) : undefined)}
            placeholder="0"
            className="rounded-xl"
          />
        </div>
      </div>
    </div>
  );
}
