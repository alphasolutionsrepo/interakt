'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Cpu,
  Plus,
  Search,
  RefreshCw,
  X,
  MoreVertical,
  Eye,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  CircleCheck,
  CircleDashed,
  Wrench,
  Server,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { PageHeaderSkeleton, StatsCardsSkeleton, TableSkeleton } from '@/shared/ui/custom/skeletons';
import { DeleteConfirmDialog } from '@/shared/ui/custom/DeleteConfirmDialog';
import { McpStatusChip } from '../_components/McpStatusChip';
import { useMcpConnections } from '../_lib/hooks/useMcpConnections';
import type { McpConnection, McpStatus } from '../_lib/api-client';

function GlowCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`group relative cursor-pointer ${className}`}>
      <div className="relative rounded-2xl border border-border/60 bg-card shadow-sm transition-all duration-200 group-hover:shadow-md group-hover:border-border">
        {children}
      </div>
    </div>
  );
}

function MetricCard({
  label, value, icon, iconBg,
}: {
  label: string; value: number; icon: React.ReactNode; iconBg: string;
}) {
  return (
    <GlowCard>
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{label}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
          </div>
          <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
            {icon}
          </div>
        </div>
      </div>
    </GlowCard>
  );
}

function TableView({ connections, onView, onDelete, emptyAction }: {
  connections: McpConnection[];
  onView: (c: McpConnection) => void;
  onDelete: (c: McpConnection) => void;
  emptyAction: React.ReactNode;
}) {
  if (connections.length === 0) {
    return (
      <GlowCard>
        <div className="flex flex-col items-center justify-center py-20 px-6">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-indigo-500/10 ring-1 ring-indigo-500/15 mb-6">
            <Cpu className="size-8 text-indigo-500" />
          </div>
          <h3 className="text-2xl font-semibold tracking-tight">No MCP connections yet</h3>
          <p className="mt-3 text-muted-foreground text-center max-w-md">
            Connect a Model Context Protocol server to bring its tools into your AI experiences.
          </p>
          <div className="mt-8">{emptyAction}</div>
        </div>
      </GlowCard>
    );
  }

  return (
    <GlowCard>
      <div className="overflow-hidden rounded-2xl">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              {['Connection', 'Server', 'Health', 'Tools', 'Status', 'Last Sync', ''].map((h, i) => (
                <th key={i} className={`px-6 py-4 text-left text-xs font-semibold tracking-widest text-muted-foreground uppercase ${
                  i === 5 ? 'hidden xl:table-cell' : ''
                }`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {connections.map((c) => (
              <tr
                key={c.id}
                onClick={() => onView(c)}
                className="group cursor-pointer transition-colors hover:bg-muted/20"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3.5">
                    <div className="relative">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/10">
                        <Cpu className="size-5 text-indigo-500" />
                      </div>
                      {c.isActive && (
                        <div className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-emerald-500 ring-2 ring-background" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate group-hover:text-primary transition-colors">{c.name}</p>
                      <p className="text-sm text-muted-foreground font-mono truncate">{c.slug}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Server className="size-4 shrink-0" />
                    <span className="truncate max-w-[280px]" title={c.serverUrl}>{c.serverUrl}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <McpStatusChip status={c.status} />
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5">
                    <Wrench className="size-4 text-muted-foreground" />
                    <span className="font-semibold tabular-nums">
                      {c.discoveredTools?.tools.length ?? 0}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {c.isActive ? (
                    <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 rounded-lg px-2.5 py-1 text-xs font-semibold">
                      <CircleCheck className="mr-1.5 size-3.5" /> Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-lg px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                      <CircleDashed className="mr-1.5 size-3.5" /> Inactive
                    </Badge>
                  )}
                </td>
                <td className="px-6 py-4 hidden xl:table-cell text-muted-foreground font-medium">
                  {c.lastDiscoveredAt ? format(new Date(c.lastDiscoveredAt), 'MMM d, HH:mm') : 'Never'}
                </td>
                <td className="px-6 py-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 rounded-xl">
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); onView(c); }}
                        className="rounded-lg py-2"
                      >
                        <Eye className="size-4" /> View Details
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); onDelete(c); }}
                        className="text-destructive focus:text-destructive rounded-lg py-2"
                      >
                        <Trash2 className="size-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlowCard>
  );
}

export default function McpConnectionsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<McpConnection | null>(null);

  const {
    connections, pagination, isLoading, isRefetching, isDeleting,
    deleteConnection, refetch,
  } = useMcpConnections({
    page, pageSize,
    search: search || undefined,
    status: statusFilter === 'all' ? undefined : (statusFilter as McpStatus),
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const totalItems = pagination?.totalItems ?? 0;
  const healthyCount = connections.filter((c) => c.status === 'healthy').length;
  const activeCount = connections.filter((c) => c.isActive).length;
  const totalTools = connections.reduce(
    (acc, c) => acc + (c.discoveredTools?.tools.length ?? 0),
    0,
  );

  async function handleDelete() {
    if (!deleting) return;
    await deleteConnection(deleting.id);
    setDeleteOpen(false);
    setDeleting(null);
  }

  const hasFilters = search || statusFilter !== 'all';

  const createButton = (
    <Button
      onClick={() => router.push('/mcp-connections/create')}
      size="lg"
      className="rounded-xl px-6 font-bold"
    >
      <Plus className="mr-2 size-5" /> New Connection
    </Button>
  );

  if (isLoading && !connections.length) {
    return (
      <div className="flex-1 space-y-8 p-6 lg:p-8">
        <PageHeaderSkeleton showBreadcrumb={false} />
        <StatsCardsSkeleton count={4} columns={4} />
        <TableSkeleton rows={5} showSearch={false} />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      <PageHeader
        variant="hero"
        title="MCP Connections"
        description="Connect Model Context Protocol servers to bring their tools into your AI experiences without writing a tool per call."
        icon={Cpu}
        iconBg="bg-indigo-500/10"
        iconColor="text-indigo-500"
        actions={createButton}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total"
          value={totalItems}
          icon={<Cpu className="size-5 text-indigo-500" />}
          iconBg="bg-indigo-500/10"
        />
        <MetricCard
          label="Active"
          value={activeCount}
          icon={<CircleCheck className="size-5 text-emerald-500" />}
          iconBg="bg-emerald-500/10"
        />
        <MetricCard
          label="Healthy"
          value={healthyCount}
          icon={<CircleCheck className="size-5 text-emerald-500" />}
          iconBg="bg-emerald-500/10"
        />
        <MetricCard
          label="Tools Available"
          value={totalTools}
          icon={<Wrench className="size-5 text-violet-500" />}
          iconBg="bg-violet-500/10"
        />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 lg:max-w-md">
            <Search className="absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search connections..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-12 rounded-xl pl-12 text-base border-border/50 font-medium"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="h-12 w-[170px] rounded-xl border-border/50 bg-muted/30 font-bold">
              <SelectValue placeholder="Health" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="rounded-lg font-medium">All Health</SelectItem>
              <SelectItem value="healthy" className="rounded-lg font-medium">Healthy</SelectItem>
              <SelectItem value="degraded" className="rounded-lg font-medium">Degraded</SelectItem>
              <SelectItem value="error" className="rounded-lg font-medium">Error</SelectItem>
              <SelectItem value="unknown" className="rounded-lg font-medium">Unknown</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setSearch(''); setStatusFilter('all'); setPage(1); }}
              className="size-12 rounded-xl"
            >
              <X className="size-5" />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="size-12 rounded-xl border-border/50"
          >
            <RefreshCw className={`size-5 ${isRefetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <TableView
        connections={connections}
        onView={(c) => router.push(`/mcp-connections/${c.id}`)}
        onDelete={(c) => { setDeleting(c); setDeleteOpen(true); }}
        emptyAction={createButton}
      />

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-base text-muted-foreground font-medium">
            Showing{' '}
            <span className="font-bold tabular-nums text-foreground">{(page - 1) * pageSize + 1}</span>
            {' '}&ndash;{' '}
            <span className="font-bold tabular-nums text-foreground">{Math.min(page * pageSize, pagination.totalItems)}</span>{' '}
            of <span className="font-bold tabular-nums text-foreground">{pagination.totalItems}</span>
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="h-11 rounded-xl px-5 font-bold"
            >
              <ChevronLeft className="mr-1 size-5" /> Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => setPage(page + 1)}
              disabled={page >= pagination.totalPages}
              className="h-11 rounded-xl px-5 font-bold"
            >
              Next <ChevronRight className="ml-1 size-5" />
            </Button>
          </div>
        </div>
      )}

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName={deleting?.name ?? ''}
        title="Delete MCP Connection"
        description="Any experience attached to this connection will lose access to its tools. This cannot be undone."
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}

// Suppress unused-import warning — ArrowUpRight kept for future card view
void ArrowUpRight;
