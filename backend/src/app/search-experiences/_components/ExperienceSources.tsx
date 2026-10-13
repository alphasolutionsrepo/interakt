// app/search-experiences/_components/ExperienceSources.tsx

/**
 * Sources of a search experience: search indexes Interakt manages and external
 * indexes (data sources of type search_index_external) it only queries.
 *
 * Presentational: the create wizard drives it with form state, the edit page with
 * API mutations. `useSourceOptions` loads what can be picked.
 */

'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Database, Globe, Layers, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDataSources } from '@/app/data-sources/_lib/hooks/useDataSources';
import { useSearchExperience } from '../_lib/hooks';

// ============================================================================
// OPTIONS
// ============================================================================

export interface IndexOption {
  id: string;
  name: string;
  displayName: string;
  searchType: string;
  searchProvider: string;
}

export interface ExternalOption {
  id: string;
  name: string;
  /** Human label of the engine, e.g. "Sitecore Search" */
  providerLabel: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  elasticsearch: 'Elasticsearch',
  azure_ai_search: 'Azure AI Search',
  sitecore_search: 'Sitecore Search',
};

export function externalProviderLabel(provider: string | null | undefined): string {
  return provider ? PROVIDER_LABELS[provider] ?? provider : 'External';
}

/** Active search indexes and external indexes that can be attached. */
export function useSourceOptions() {
  const indexesQuery = useQuery({
    queryKey: ['search-indexes', 'all-active'],
    queryFn: async () => {
      const response = await fetch('/api/search-indexes?isActive=true&pageSize=100');
      const data = await response.json();
      return (data.data?.items || []) as IndexOption[];
    },
  });

  const { dataSources, isLoading: isLoadingExternal } = useDataSources({
    type: 'search_index_external',
    isActive: true,
    pageSize: 100,
  });

  const externalOptions: ExternalOption[] = dataSources.map((ds) => ({
    id: ds.id,
    name: ds.name,
    providerLabel: externalProviderLabel((ds.config as { provider?: string } | null)?.provider),
  }));

  return {
    indexOptions: indexesQuery.data ?? [],
    externalOptions,
    isLoading: indexesQuery.isLoading || isLoadingExternal,
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

interface ExperienceSourcesProps {
  selectedIndexes: Array<{ searchIndexId: string; role: string }>;
  selectedExternal: string[];
  indexOptions: IndexOption[];
  externalOptions: ExternalOption[];
  isLoading?: boolean;
  disabled?: boolean;
  error?: string;
  onAddIndex: (searchIndexId: string) => void;
  onRemoveIndex: (searchIndexId: string) => void;
  onRoleChange: (searchIndexId: string, role: 'primary' | 'secondary') => void;
  onAddExternal: (dataSourceId: string) => void;
  onRemoveExternal: (dataSourceId: string) => void;
}

export function ExperienceSources({
  selectedIndexes,
  selectedExternal,
  indexOptions,
  externalOptions,
  isLoading,
  disabled,
  error,
  onAddIndex,
  onRemoveIndex,
  onRoleChange,
  onAddExternal,
  onRemoveExternal,
}: ExperienceSourcesProps) {
  const total = selectedIndexes.length + selectedExternal.length;
  // The last source can't be removed: an experience must search something.
  const canRemove = total > 1 && !disabled;
  const unselectedIndexes = indexOptions.filter(
    (o) => !selectedIndexes.some((s) => s.searchIndexId === o.id)
  );
  const unselectedExternal = externalOptions.filter((o) => !selectedExternal.includes(o.id));

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground -mt-2">
        Results come from every source listed here. Add at least one search index or external index.
      </p>

      {/* Search indexes */}
      <div className="space-y-3">
        <div>
          <Label>Search indexes</Label>
          <p className="text-xs text-muted-foreground mt-1">Indexes Interakt manages and keeps in sync.</p>
        </div>

        {selectedIndexes.map((idx) => {
          const info = indexOptions.find((o) => o.id === idx.searchIndexId);
          return (
            <SourceCard
              key={idx.searchIndexId}
              icon={<Database className="h-4 w-4 text-muted-foreground" />}
              title={info?.displayName || 'Unknown index'}
              subtitle={info?.name}
              href={`/search-indexes/${idx.searchIndexId}`}
              onRemove={canRemove ? () => onRemoveIndex(idx.searchIndexId) : undefined}
            >
              <Select
                value={idx.role}
                disabled={disabled}
                onValueChange={(value: 'primary' | 'secondary') => onRoleChange(idx.searchIndexId, value)}
              >
                <SelectTrigger className="w-28 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="secondary">Secondary</SelectItem>
                </SelectContent>
              </Select>
            </SourceCard>
          );
        })}

        <AddSourceSelect
          isLoading={isLoading}
          disabled={disabled}
          placeholder="Add search index..."
          options={unselectedIndexes.map((o) => ({
            id: o.id,
            label: o.displayName,
            badge: o.searchType,
            icon: <Database className="h-4 w-4 text-muted-foreground" />,
          }))}
          emptyText={indexOptions.length === 0 ? 'No search indexes yet.' : undefined}
          onSelect={onAddIndex}
        />
      </div>

      {/* External indexes */}
      <div className="space-y-3">
        <div>
          <Label>External indexes</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Search engines you already run (Elasticsearch, Azure AI Search, Sitecore Search), set up under{' '}
            <Link href="/data-sources" className="underline hover:text-foreground">Data Sources</Link>. Interakt
            queries them; content and ranking stay where they are.
          </p>
        </div>

        {selectedExternal.map((dataSourceId) => {
          const info = externalOptions.find((o) => o.id === dataSourceId);
          return (
            <SourceCard
              key={dataSourceId}
              icon={<Globe className="h-4 w-4 text-muted-foreground" />}
              title={info?.name || 'Unknown data source'}
              subtitle={info?.providerLabel}
              href={`/data-sources/${dataSourceId}`}
              onRemove={canRemove ? () => onRemoveExternal(dataSourceId) : undefined}
            />
          );
        })}

        <AddSourceSelect
          isLoading={isLoading}
          disabled={disabled}
          placeholder="Add external index..."
          options={unselectedExternal.map((o) => ({
            id: o.id,
            label: o.name,
            badge: o.providerLabel,
            icon: <Globe className="h-4 w-4 text-muted-foreground" />,
          }))}
          emptyText={
            externalOptions.length === 0 ? 'No external indexes yet. Add one under Data Sources → External Index.' : undefined
          }
          onSelect={onAddExternal}
        />
      </div>

      {error && <p className="text-sm text-destructive font-medium">{error}</p>}
    </div>
  );
}

// ============================================================================
// EDIT PAGE CARD
// ============================================================================

/**
 * Sources card for an existing experience. Each change is saved right away
 * (unlike the rest of the edit form, which waits for Save).
 */
export function ExperienceSourcesCard({ experienceId }: { experienceId: string }) {
  const {
    experience,
    addIndex,
    removeIndex,
    updateIndex,
    addExternalSource,
    removeExternalSource,
    isAddingIndex,
    isRemovingIndex,
    isUpdatingIndex,
    isChangingExternalSources,
  } = useSearchExperience(experienceId);
  const { indexOptions, externalOptions, isLoading } = useSourceOptions();

  if (!experience) return null;

  const busy = isAddingIndex || isRemovingIndex || isUpdatingIndex || isChangingExternalSources;

  return (
    <Card className="border-border/60 shadow-sm rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Layers className="h-4 w-4 text-blue-500" />
          Sources
        </CardTitle>
        <CardDescription>Changes to sources are saved immediately.</CardDescription>
      </CardHeader>
      <CardContent>
        <ExperienceSources
          selectedIndexes={experience.indexes}
          selectedExternal={(experience.externalSources ?? []).map((s) => s.dataSourceId)}
          indexOptions={indexOptions}
          externalOptions={externalOptions}
          isLoading={isLoading}
          disabled={busy}
          onAddIndex={(searchIndexId) =>
            addIndex({
              searchIndexId,
              role: experience.indexes.length === 0 ? 'primary' : 'secondary',
              weight: 1,
              sortOrder: experience.indexes.length,
            })
          }
          onRemoveIndex={(searchIndexId) => removeIndex(searchIndexId)}
          onRoleChange={(indexId, role) => updateIndex({ indexId, data: { role } })}
          onAddExternal={(dataSourceId) => addExternalSource(dataSourceId)}
          onRemoveExternal={(dataSourceId) => removeExternalSource(dataSourceId)}
        />
      </CardContent>
    </Card>
  );
}

// ============================================================================
// PARTS
// ============================================================================

function SourceCard({
  icon,
  title,
  subtitle,
  href,
  onRemove,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  href: string;
  onRemove?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Card className="border-border/60 rounded-xl">
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-3">
          <Link href={href} className="flex items-center gap-3 min-w-0 hover:underline">
            <div className="p-2 bg-muted rounded-lg shrink-0">{icon}</div>
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{title}</p>
              {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
            </div>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            {children}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onRemove}
              disabled={!onRemove}
              title={onRemove ? 'Remove' : 'An experience needs at least one source'}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AddSourceSelect({
  isLoading,
  disabled,
  placeholder,
  options,
  emptyText,
  onSelect,
}: {
  isLoading?: boolean;
  disabled?: boolean;
  placeholder: string;
  options: Array<{ id: string; label: string; badge: string; icon: React.ReactNode }>;
  emptyText?: string;
  onSelect: (id: string) => void;
}) {
  if (isLoading) return <Skeleton className="h-10 w-full" />;
  if (options.length === 0) {
    return emptyText ? <p className="text-xs text-muted-foreground">{emptyText}</p> : null;
  }

  return (
    // Keyed on the option count so the trigger resets to its placeholder after each pick.
    <Select key={options.length} onValueChange={onSelect} disabled={disabled}>
      <SelectTrigger className="w-full rounded-xl">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Plus className="h-4 w-4" />
          <span>{placeholder}</span>
        </div>
      </SelectTrigger>
      <SelectContent className="rounded-xl">
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id} className="rounded-lg">
            <div className="flex items-center gap-2">
              {o.icon}
              <span>{o.label}</span>
              <Badge variant="outline" className="text-xs ml-2 rounded-md">{o.badge}</Badge>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
