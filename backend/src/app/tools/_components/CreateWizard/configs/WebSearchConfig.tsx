'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, X } from 'lucide-react';

interface WebSearchConfigProps {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  errors?: Record<string, string>;
}

export function WebSearchConfig({ value, onChange }: WebSearchConfigProps) {
  const [includeInput, setIncludeInput] = useState('');
  const [excludeInput, setExcludeInput] = useState('');

  function set(key: string, val: unknown) {
    onChange({ ...value, [key]: val });
  }

  const includeDomains = (value.includeDomains as string[]) ?? [];
  const excludeDomains = (value.excludeDomains as string[]) ?? [];

  function addIncludeDomain() {
    const domain = includeInput.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!domain || includeDomains.includes(domain)) return;
    set('includeDomains', [...includeDomains, domain]);
    setIncludeInput('');
  }

  function removeIncludeDomain(domain: string) {
    const next = includeDomains.filter((d) => d !== domain);
    set('includeDomains', next.length ? next : undefined);
  }

  function addExcludeDomain() {
    const domain = excludeInput.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!domain || excludeDomains.includes(domain)) return;
    set('excludeDomains', [...excludeDomains, domain]);
    setExcludeInput('');
  }

  function removeExcludeDomain(domain: string) {
    const next = excludeDomains.filter((d) => d !== domain);
    set('excludeDomains', next.length ? next : undefined);
  }

  return (
    <div className="space-y-5">
      {/* API Key Secret */}
      <div className="space-y-1.5">
        <Label>Tavily API Key Secret</Label>
        <Input
          value={(value.apiKeySecret as string) || ''}
          onChange={(e) => set('apiKeySecret', e.target.value || undefined)}
          placeholder="tavily_api_key"
          className="rounded-xl font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Name of the secret containing your Tavily API key. Create it in{' '}
          <span className="font-medium">Secrets Vault</span> first.
        </p>
      </div>

      {/* Max Results */}
      <div className="space-y-1.5">
        <Label>Max Results</Label>
        <Input
          type="number"
          min={1}
          max={20}
          value={(value.maxResults as number) ?? 5}
          onChange={(e) => set('maxResults', Number(e.target.value))}
          className="rounded-xl"
        />
        <p className="text-xs text-muted-foreground">Maximum number of web search results (1–20).</p>
      </div>

      {/* Search Depth */}
      <div className="space-y-1.5">
        <Label>Search Depth</Label>
        <Select
          value={(value.searchDepth as string) || 'basic'}
          onValueChange={(v) => set('searchDepth', v)}
        >
          <SelectTrigger className="rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="basic">Basic — Faster, less thorough</SelectItem>
            <SelectItem value="advanced">Advanced — Slower, more comprehensive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Include Answer */}
      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-4">
        <div>
          <p className="text-sm font-medium">Include Answer</p>
          <p className="text-xs text-muted-foreground">
            Ask Tavily to generate a short synthesized answer in addition to results.
          </p>
        </div>
        <Switch
          checked={Boolean(value.includeAnswer)}
          onCheckedChange={(v) => set('includeAnswer', v)}
        />
      </div>

      {/* Include Domains (whitelist) */}
      <div className="space-y-2">
        <Label>Include Domains</Label>
        <div className="flex gap-2">
          <Input
            value={includeInput}
            onChange={(e) => setIncludeInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addIncludeDomain())}
            placeholder="ahlsell.com"
            className="rounded-xl font-mono text-sm flex-1"
          />
          <Button type="button" variant="outline" className="rounded-xl gap-1" onClick={addIncludeDomain}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>
        {includeDomains.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {includeDomains.map((domain) => (
              <Badge
                key={domain}
                variant="secondary"
                className="rounded-lg px-2.5 py-1 text-xs gap-1.5 font-mono"
              >
                {domain}
                <button type="button" onClick={() => removeIncludeDomain(domain)} className="hover:text-destructive">
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Only return results from these domains. Leave empty to search the entire web.
        </p>
      </div>

      {/* Exclude Domains */}
      <div className="space-y-2">
        <Label>Exclude Domains</Label>
        <div className="flex gap-2">
          <Input
            value={excludeInput}
            onChange={(e) => setExcludeInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addExcludeDomain())}
            placeholder="reddit.com"
            className="rounded-xl font-mono text-sm flex-1"
          />
          <Button type="button" variant="outline" className="rounded-xl gap-1" onClick={addExcludeDomain}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>
        {excludeDomains.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {excludeDomains.map((domain) => (
              <Badge
                key={domain}
                variant="secondary"
                className="rounded-lg px-2.5 py-1 text-xs gap-1.5 font-mono"
              >
                {domain}
                <button type="button" onClick={() => removeExcludeDomain(domain)} className="hover:text-destructive">
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Never return results from these domains. Ignored if Include Domains is set.
        </p>
      </div>
    </div>
  );
}
