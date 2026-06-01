'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Cpu,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  Activity,
  Server,
  Wrench,
  Clock,
  ChevronDown,
  Code2,
  Loader2,
  CircleCheck,
  CircleDashed,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { PageHeaderSkeleton } from '@/shared/ui/custom/skeletons';
import { McpStatusChip } from '../../_components/McpStatusChip';
import { useMcpConnection } from '../../_lib/hooks/useMcpConnections';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function McpConnectionDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const {
    connection, isLoading, isError,
    syncConnection, isSyncing,
    testConnection, isTesting,
    updateConnection, isUpdating,
  } = useMcpConnection(id);

  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex-1 space-y-8 p-6 lg:p-8">
        <PageHeaderSkeleton showBreadcrumb />
      </div>
    );
  }

  if (isError || !connection) {
    return (
      <div className="flex-1 p-6 lg:p-8">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <h2 className="text-xl font-bold text-destructive">Connection not found</h2>
          <p className="mt-2 text-muted-foreground">
            The MCP connection may have been deleted.
          </p>
          <Button
            onClick={() => router.push('/mcp-connections')}
            className="mt-6 rounded-xl"
          >
            <ArrowLeft className="mr-1.5 size-4" /> Back to connections
          </Button>
        </div>
      </div>
    );
  }

  const tools = connection.discoveredTools?.tools ?? [];

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      <PageHeader
        variant="detail"
        title={connection.name}
        description={connection.description ?? `MCP connection · ${connection.transport}`}
        breadcrumb={
          <>
            <Link href="/mcp-connections" className="hover:text-foreground transition-colors font-medium">
              MCP Connections
            </Link>
            <ChevronRight className="size-3.5" />
            <span className="text-foreground font-medium">{connection.slug}</span>
          </>
        }
        customIcon={
          <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 via-indigo-500/10 to-transparent ring-1 ring-indigo-500/30 shadow-sm">
            <Cpu className="size-6 text-indigo-500" />
          </div>
        }
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => testConnection()}
              disabled={isTesting}
              className="rounded-xl"
            >
              {isTesting ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Activity className="mr-1.5 size-4" />
              )}
              Test
            </Button>
            <Button
              onClick={() => syncConnection()}
              disabled={isSyncing}
              className="rounded-xl"
            >
              {isSyncing ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 size-4" />
              )}
              Sync
            </Button>
          </div>
        }
      />

      {/* Overview */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-3 lg:col-span-2">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Connection
          </h3>
          <div className="flex items-start gap-3">
            <Server className="size-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm truncate" title={connection.serverUrl}>
                {connection.serverUrl}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {connection.transport} · auth: {connection.authConfig?.type ?? 'none'}
              </p>
            </div>
          </div>
          {connection.discoveredTools?.serverInfo && (
            <div className="flex items-center gap-2 pt-2 border-t border-border/40">
              <Badge variant="outline" className="rounded-lg">
                {connection.discoveredTools.serverInfo.name ?? 'Unknown server'}
              </Badge>
              {connection.discoveredTools.serverInfo.version && (
                <Badge variant="outline" className="rounded-lg font-mono text-xs">
                  v{connection.discoveredTools.serverInfo.version}
                </Badge>
              )}
              {connection.discoveredTools.protocolVersion && (
                <Badge variant="outline" className="rounded-lg font-mono text-xs">
                  MCP {connection.discoveredTools.protocolVersion}
                </Badge>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Health
          </h3>
          <div className="flex items-center gap-3">
            <McpStatusChip status={connection.status} />
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                updateConnection({ isActive: !connection.isActive })
              }
              disabled={isUpdating}
              className="rounded-lg ml-auto"
            >
              {connection.isActive ? (
                <><CircleCheck className="mr-1 size-3.5 text-emerald-500" /> Active</>
              ) : (
                <><CircleDashed className="mr-1 size-3.5" /> Inactive</>
              )}
            </Button>
          </div>
          {connection.lastHealthMessage && (
            <p className="text-xs text-muted-foreground line-clamp-3">
              {connection.lastHealthMessage}
            </p>
          )}
          {connection.lastHealthCheckAt && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="size-3" />
              Checked {format(new Date(connection.lastHealthCheckAt), "MMM d 'at' HH:mm")}
            </p>
          )}
        </section>
      </div>

      {/* Tool catalog */}
      <section className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/10">
              <Wrench className="size-5 text-violet-500" />
            </div>
            <div>
              <h3 className="text-base font-bold">Discovered tools</h3>
              <p className="text-sm text-muted-foreground">
                {tools.length === 0
                  ? 'No tools yet. Click Sync to discover them.'
                  : `${tools.length} tool${tools.length === 1 ? '' : 's'} available to experiences attached to this connection.`}
              </p>
            </div>
          </div>
          {connection.lastDiscoveredAt && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="size-3" />
              Last synced {format(new Date(connection.lastDiscoveredAt), "MMM d 'at' HH:mm")}
            </p>
          )}
        </div>

        {tools.length > 0 && (
          <div className="divide-y divide-border/50">
            {tools.map((tool) => {
              const expanded = expandedTool === tool.name;
              return (
                <Collapsible
                  key={tool.name}
                  open={expanded}
                  onOpenChange={(o) => setExpandedTool(o ? tool.name : null)}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-start gap-4 px-6 py-4 text-left hover:bg-muted/30 transition-colors"
                    >
                      <Code2 className="size-4 mt-1 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold font-mono text-sm">{tool.name}</p>
                        {tool.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {tool.description}
                          </p>
                        )}
                      </div>
                      <ChevronDown className={`size-4 mt-1 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-6 pb-4 -mt-2 space-y-3">
                      {tool.inputSchema && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Input schema
                          </p>
                          <pre className="text-xs font-mono bg-muted/40 rounded-lg p-3 overflow-x-auto">
                            {JSON.stringify(tool.inputSchema, null, 2)}
                          </pre>
                        </div>
                      )}
                      {tool.outputSchema && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Output schema
                          </p>
                          <pre className="text-xs font-mono bg-muted/40 rounded-lg p-3 overflow-x-auto">
                            {JSON.stringify(tool.outputSchema, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border/60 bg-muted/20 p-6">
        <h3 className="text-sm font-bold mb-2">How to use</h3>
        <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal pl-5">
          <li>Open an AI Experience and attach this connection (no extra step per tool).</li>
          <li>Optionally restrict which tool names from this connection that experience exposes.</li>
          <li>
            At chat time, the experience&apos;s LLM sees the tools as
            <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-xs">mcp__{connection.slug}__&lt;tool&gt;</code>
            and calls them directly.
          </li>
        </ol>
      </section>
    </div>
  );
}
