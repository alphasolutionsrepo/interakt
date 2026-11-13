'use client';

import { format } from 'date-fns';
import {
  ChevronRight,
  ChevronDown,
  Edit2,
  Power,
  PowerOff,
  CircleCheck,
  CircleDashed,
  Database,
  HardDrive,
  Clock,
  FileText,
  RefreshCw,
  Loader2,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';

import { CreateToolsPanel } from '../../_components/CreateToolsPanel';
import { DataSourceTypeChip, DS_TYPE_CONFIG } from '../../_components/DataSourceTypeChip';
import { HealthStatusChip } from '../../_components/HealthStatusChip';
import { ScaffoldResult } from '../../_components/ScaffoldResult';
import { SchemaFieldsEditor } from '../../_components/SchemaFieldsEditor';
import type { DataSourceType } from '../../_lib/api-client';
import { useDataSource } from '../../_lib/hooks/useDataSources';
import { useHealthCheck } from '../../_lib/hooks/useHealthCheck';

import type { ScaffoldToolsResponse } from '@/app/tools/_lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ActionButton } from '@/shared/access/ActionControls';
import { DangerZone } from '@/shared/ui/custom/DangerZone';
import { DeleteConfirmDialog } from '@/shared/ui/custom/DeleteConfirmDialog';
import { PageHeader } from '@/shared/ui/custom/PageHeader';

// ============================================================================
// HELPERS
// ============================================================================

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes === 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function ConfigRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider w-36 shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-sm font-medium break-all">{value}</span>
    </div>
  );
}

// ============================================================================
// CONFIG DISPLAY
// ============================================================================

function ConfigDisplay({ type, config }: { type: string; config: Record<string, unknown> }) {
  if (type === 'search_index') {
    return (
      <div>
        <ConfigRow label="Index ID" value={
          config.searchIndexId
            ? <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{config.searchIndexId as string}</code>
            : <span className="text-muted-foreground text-xs">Not set</span>
        } />
      </div>
    );
  }

  if (type === 'search_index_external') {
    const conn = (config.connection as Record<string, unknown>) || {};
    const searchDefaults = (config.searchDefaults as Record<string, unknown>) || {};
    return (
      <div>
        <ConfigRow label="Provider" value={<Badge variant="outline" className="rounded-lg text-xs capitalize">{config.provider as string}</Badge>} />
        <ConfigRow label="URL" value={<code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded break-all">{conn.url as string}</code>} />
        <ConfigRow label="Index Name" value={<code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{conn.indexName as string}</code>} />
        <ConfigRow label="Auth Type" value={<Badge variant="outline" className="rounded-lg text-xs">{(conn.authType as string) || 'none'}</Badge>} />
        {searchDefaults.searchType && <ConfigRow label="Search Type" value={<Badge variant="outline" className="rounded-lg text-xs">{searchDefaults.searchType as string}</Badge>} />}
        {searchDefaults.maxResults && <ConfigRow label="Max Results" value={String(searchDefaults.maxResults)} />}
      </div>
    );
  }

  // Fallback: show raw JSON
  return <pre className="text-xs font-mono bg-muted p-3 rounded-xl overflow-auto">{JSON.stringify(config, null, 2)}</pre>;
}

// ============================================================================
// SCHEMA DISPLAY
// ============================================================================

// ============================================================================
// PAGE
// ============================================================================

export default function DataSourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { dataSource, isLoading, isError, updateDataSource, deleteDataSource, isUpdating, isDeleting } = useDataSource(id);
  const { isChecking: isHealthChecking, refresh: refreshHealth } = useHealthCheck(id);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [scaffoldResult, setScaffoldResult] = useState<ScaffoldToolsResponse | null>(null);

  // Force a health check if schema hasn't been discovered yet
  useEffect(() => {
    if (dataSource && !dataSource.schema) {
      refreshHealth();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource?.schema]);

  if (isLoading) {
    return (
      <div className="flex-1 p-6 lg:p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-16 bg-muted rounded-2xl" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-muted rounded-2xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !dataSource) {
    return (
      <div className="flex-1 p-6 lg:p-8 text-center text-muted-foreground">
        <p>Data source not found.</p>
        <Link href="/data-sources" className="text-primary underline mt-2 inline-block">Back to Data Sources</Link>
      </div>
    );
  }

  const cfg = DS_TYPE_CONFIG[dataSource.type as DataSourceType];
  const Icon = cfg?.icon ?? Database;

  async function handleToggleActive() {
    await updateDataSource({ isActive: !dataSource!.isActive });
  }

  async function handleDelete() {
    await deleteDataSource();
    router.push('/data-sources');
  }

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Header */}
      <PageHeader
        variant="detail"
        title={dataSource.name}
        description={dataSource.description ?? undefined}
        breadcrumb={
          <>
            <Link href="/data-sources" className="hover:text-foreground transition-colors font-medium">Data Sources</Link>
            <ChevronRight className="size-3.5" />
            <span className="text-foreground font-medium truncate max-w-[200px]">{dataSource.name}</span>
          </>
        }
        customIcon={
          <div className="relative">
            <div className={`flex size-12 items-center justify-center rounded-xl ${cfg?.iconBg ?? 'bg-muted'}`}>
              <Icon className={`size-6 ${cfg?.iconClass ?? 'text-muted-foreground'}`} />
            </div>
            {dataSource.isActive && (
              <div className="absolute -right-0.5 -bottom-0.5 size-4 rounded-full bg-emerald-500 ring-2 ring-background" />
            )}
          </div>
        }
        badge={<DataSourceTypeChip type={dataSource.type} />}
        actions={
          <>
            <ActionButton
              action="data-sources.edit"
              builtIn={dataSource.isBuiltIn}
              icon={dataSource.isActive ? PowerOff : Power}
              iconClassName="size-4 mr-2"
              variant={dataSource.isActive ? 'outline' : 'default'}
              className={`rounded-xl ${!dataSource.isActive ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
              onClick={handleToggleActive}
              disabled={isUpdating}
            >
              {dataSource.isActive ? 'Deactivate' : 'Activate'}
            </ActionButton>
            <ActionButton action="data-sources.edit" builtIn={dataSource.isBuiltIn} icon={Edit2} iconClassName="size-4 mr-2" variant="outline" className="rounded-xl" onClick={() => router.push(`/data-sources/${id}/edit`)}>
              Edit
            </ActionButton>
          </>
        }
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Health Card (with refresh) */}
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Health</p>
              <ActionButton
                action="data-sources.health-check"
                icon={isHealthChecking ? Loader2 : RefreshCw}
                iconClassName={isHealthChecking ? 'size-3.5 animate-spin' : 'size-3.5'}
                variant="ghost"
                size="icon"
                onClick={refreshHealth}
                disabled={isHealthChecking}
                className="size-6 text-muted-foreground hover:text-foreground"
                title="Refresh health check"
                aria-label="Refresh health check"
              />
            </div>
            <HealthStatusChip status={dataSource.status} />
          </CardContent>
        </Card>

        {/* Status / Documents / Storage Cards */}
        {[
          {
            label: 'Status',
            value: dataSource.isActive ? (
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 rounded-lg px-2.5 py-1 text-xs font-semibold">
                <CircleCheck className="mr-1.5 size-3.5" />Active
              </Badge>
            ) : (
              <Badge variant="outline" className="rounded-lg px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                <CircleDashed className="mr-1.5 size-3.5" />Inactive
              </Badge>
            ),
          },
          {
            label: 'Documents',
            value: (
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                <span className="text-2xl font-bold">{dataSource.documentCount ?? '-'}</span>
              </div>
            ),
          },
          {
            label: 'Storage',
            value: (
              <div className="flex items-center gap-2">
                <HardDrive className="size-4 text-muted-foreground" />
                <span className="text-lg font-bold">{formatBytes(dataSource.storageSizeBytes)}</span>
              </div>
            ),
          },
        ].map(({ label, value }, i) => (
          <Card key={i} className="border-border/60 shadow-sm rounded-2xl">
            <CardContent className="p-5">
              <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-2">{label}</p>
              {value}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Two-column content */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Config Card */}
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Configuration</CardTitle>
            <CardDescription>Type-specific settings for this data source.</CardDescription>
          </CardHeader>
          <CardContent>
            <ConfigDisplay type={dataSource.type} config={dataSource.config} />
          </CardContent>
        </Card>

        {/* Metadata Card */}
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              Metadata
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ConfigRow label="Slug" value={<code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{dataSource.slug}</code>} />
            <ConfigRow label="Type" value={<DataSourceTypeChip type={dataSource.type} size="sm" />} />
            <ConfigRow label="Created" value={format(new Date(dataSource.createdAt), 'MMM d, yyyy HH:mm')} />
            <ConfigRow label="Updated" value={format(new Date(dataSource.updatedAt), 'MMM d, yyyy HH:mm')} />
            {dataSource.lastHealthCheckAt && (
              <ConfigRow label="Last Health Check" value={format(new Date(dataSource.lastHealthCheckAt), 'MMM d, yyyy HH:mm')} />
            )}
            {dataSource.lastHealthMessage && (
              <ConfigRow label="Health Message" value={<span className="text-sm text-muted-foreground">{dataSource.lastHealthMessage}</span>} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Schema Card — collapsed by default */}
      <Card className="border-border/60 shadow-sm rounded-2xl">
        <button
          type="button"
          className="w-full text-left"
          onClick={() => setSchemaOpen((o) => !o)}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Database className="size-4 text-blue-500" />
                Field Schema
              </CardTitle>
              <ChevronDown
                className={`size-5 text-muted-foreground transition-transform duration-200 ${schemaOpen ? 'rotate-0' : '-rotate-90'}`}
              />
            </div>
            <CardDescription>The fields available in this data source for search and filtering.</CardDescription>
          </CardHeader>
        </button>
        {schemaOpen && (
          <CardContent>
            <SchemaFieldsEditor
              schema={dataSource.schema}
              builtIn={dataSource.isBuiltIn}
              isSaving={isUpdating}
              onSave={async (fields) => {
                await updateDataSource({
                  schema: { ...(dataSource.schema as Record<string, unknown>), fields },
                });
              }}
            />
          </CardContent>
        )}
      </Card>

      {/* Tools Section */}
      <Card className="border-border/60 shadow-sm rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Wrench className="size-4 text-violet-500" />
            Tools
          </CardTitle>
          <CardDescription>
            Auto-create tools for this data source. Each supported operation (search, inspect, enumerate, lookup) gets its own tool with an AI-optimized description.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scaffoldResult ? (
            <ScaffoldResult result={scaffoldResult} onViewAll={() => router.push('/tools')} />
          ) : (
            <CreateToolsPanel dataSourceId={id} isBuiltIn={dataSource.isBuiltIn} onCreated={setScaffoldResult} />
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <DangerZone
        thing="data source"
        detail="Permanently deletes this data source. Tools referencing it will lose access."
        action="data-sources.delete"
        builtIn={dataSource.isBuiltIn}
        onDelete={() => setDeleteOpen(true)}
      />

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Data Source"
        itemName={dataSource.name}
        description="This will permanently delete the data source. Any tools referencing it will lose access."
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
