'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  ChevronDown,
  Edit2,
  Power,
  PowerOff,
  Trash2,
  CircleCheck,
  CircleDashed,
  Database,
  HardDrive,
  Clock,
  FileText,
  RefreshCw,
  Loader2,
  Wrench,
  Sparkles,
  ExternalLink,
  Check,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { DeleteConfirmDialog } from '@/shared/ui/custom/DeleteConfirmDialog';
import { toast } from 'sonner';
import { DataSourceTypeChip, DS_TYPE_CONFIG } from '../../_components/DataSourceTypeChip';
import { HealthStatusChip } from '../../_components/HealthStatusChip';
import { useDataSource } from '../../_lib/hooks/useDataSources';
import { useHealthCheck } from '../../_lib/hooks/useHealthCheck';
import { toolsApi } from '@/app/tools/_lib/api-client';
import type { ScaffoldToolsResponse } from '@/app/tools/_lib/api-client';
import type { DataSourceType } from '../../_lib/api-client';

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

function SchemaDisplay({ schema }: { schema: Record<string, unknown> | null }) {
  if (!schema) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No field schema configured. Schema will be auto-discovered when connected.
      </p>
    );
  }

  const fields = (schema.fields as Array<Record<string, unknown>>) || [];
  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No fields defined.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/50">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 bg-muted/30">
            {['Field', 'Type', 'Role', 'Searchable', 'Filterable', 'Retrievable'].map((h) => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold tracking-widest text-muted-foreground uppercase">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {fields.map((f, i) => (
            <tr key={i}>
              <td className="px-4 py-2.5">
                <div>
                  <p className="font-medium font-mono text-xs">{f.name as string}</p>
                  {f.displayName && f.displayName !== f.name && (
                    <p className="text-xs text-muted-foreground">{f.displayName as string}</p>
                  )}
                </div>
              </td>
              <td className="px-4 py-2.5">
                <Badge variant="outline" className="rounded text-[10px] font-mono">{f.type as string}</Badge>
              </td>
              <td className="px-4 py-2.5">
                {f.role ? (
                  <Badge className="bg-primary/10 text-primary border-primary/20 rounded text-[10px]">{f.role as string}</Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">-</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-xs">{f.isSearchable ? '✓' : '-'}</td>
              <td className="px-4 py-2.5 text-xs">{f.isFilterable ? '✓' : '-'}</td>
              <td className="px-4 py-2.5 text-xs">{f.isRetrievable !== false ? '✓' : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// PAGE
// ============================================================================

export default function DataSourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { dataSource, isLoading, isError, updateDataSource, deleteDataSource, isUpdating, isDeleting } = useDataSource(id);
  const { isChecking: isHealthChecking, refresh: refreshHealth } = useHealthCheck(id);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isScaffolding, setIsScaffolding] = useState(false);
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
            <Button
              variant={dataSource.isActive ? 'outline' : 'default'}
              className={`rounded-xl ${!dataSource.isActive ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
              onClick={handleToggleActive}
              disabled={isUpdating}
            >
              {dataSource.isActive ? (
                <><PowerOff className="size-4 mr-2" />Deactivate</>
              ) : (
                <><Power className="size-4 mr-2" />Activate</>
              )}
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={() => router.push(`/data-sources/${id}/edit`)}>
              <Edit2 className="size-4 mr-2" />Edit
            </Button>
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
              <button
                onClick={refreshHealth}
                disabled={isHealthChecking}
                className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                title="Refresh health check"
              >
                {isHealthChecking ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
              </button>
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
            <SchemaDisplay schema={dataSource.schema} />
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
            <div className="space-y-4">
              {scaffoldResult.created.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="size-3" />
                    Created {scaffoldResult.created.length} tool{scaffoldResult.created.length !== 1 ? 's' : ''}
                  </p>
                  <div className="space-y-1.5">
                    {scaffoldResult.created.map((t) => (
                      <Link key={t.id} href={`/tools/${t.id}`}
                        className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors group">
                        <div className="flex items-center gap-2.5">
                          <Check className="size-4 text-emerald-500" />
                          <div>
                            <p className="text-sm font-medium">{t.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{t.operation}</p>
                          </div>
                        </div>
                        <ExternalLink className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {scaffoldResult.skipped.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Skipped ({scaffoldResult.skipped.length})
                  </p>
                  {scaffoldResult.skipped.map((s, i) => (
                    <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/30 text-sm">
                      <Badge variant="outline" className="rounded text-[10px] font-mono">{s.operation}</Badge>
                      <span className="text-xs text-muted-foreground">{s.reason}</span>
                    </div>
                  ))}
                </div>
              )}
              <Button variant="outline" className="rounded-xl" onClick={() => router.push('/tools')}>
                <Wrench className="size-4 mr-2" />View All Tools
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-violet-500/5 rounded-xl border border-violet-500/20">
              <div>
                <p className="font-medium text-sm">Create tools automatically</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Generates one tool per supported operation with AI descriptions based on the field schema.
                </p>
              </div>
              <Button
                className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white"
                onClick={async () => {
                  setIsScaffolding(true);
                  try {
                    const result = await toolsApi.scaffoldTools(id);
                    setScaffoldResult(result);
                    if (result.created.length > 0) {
                      toast.success(`Created ${result.created.length} tool${result.created.length !== 1 ? 's' : ''}`);
                    } else {
                      toast.info('All tools already exist for this data source.');
                    }
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Failed to create tools');
                  } finally {
                    setIsScaffolding(false);
                  }
                }}
                disabled={isScaffolding}
              >
                {isScaffolding ? (
                  <><Loader2 className="size-4 mr-2 animate-spin" />Creating...</>
                ) : (
                  <><Sparkles className="size-4 mr-2" />Create Tools</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/30 shadow-sm rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 font-semibold text-destructive">
            <Trash2 className="size-4" />Danger Zone
          </CardTitle>
          <CardDescription>Irreversible actions that permanently affect this data source.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-destructive/5 rounded-xl border border-destructive/20">
            <div>
              <p className="font-medium text-sm">Delete this data source</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently deletes this data source. Tools referencing it will lose access.
              </p>
            </div>
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4 mr-2" />Delete
            </Button>
          </div>
        </CardContent>
      </Card>

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
