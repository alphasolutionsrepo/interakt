'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Trash2,
  Search,
  X,
  Loader2,
  Cpu,
  Wrench,
  ChevronDown,
  Filter,
  CircleCheck,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  useExperienceMcpAttachments,
  useMcpConnections,
} from '@/app/mcp-connections/_lib/hooks/useMcpConnections';
import { McpStatusChip } from '@/app/mcp-connections/_components/McpStatusChip';
import type { McpConnection, AttachmentDTO } from '@/app/mcp-connections/_lib/api-client';

interface McpAttachmentPanelProps {
  experienceId: string;
}

export function McpAttachmentPanel({ experienceId }: McpAttachmentPanelProps) {
  const {
    attachments, isLoading,
    attachConnection, isAttaching,
    updateAttachment, isUpdatingAttachment,
    detachConnection, isDetaching,
  } = useExperienceMcpAttachments(experienceId);

  const [pickerOpen, setPickerOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {attachments.length === 0
            ? 'No MCP connections attached.'
            : `${attachments.length} connection${attachments.length === 1 ? '' : 's'} attached. Their tools appear to the LLM alongside regular tools.`}
        </div>
        <Button
          size="sm"
          onClick={() => setPickerOpen(true)}
          className="rounded-xl"
        >
          <Plus className="mr-1 size-4" /> Attach connection
        </Button>
      </div>

      {attachments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          <Cpu className="size-8 mx-auto mb-2 text-muted-foreground/60" />
          <p>Attach an MCP server to expose its tools to this experience.</p>
          <p className="text-xs mt-2">
            Don&apos;t have one yet?{' '}
            <Link href="/mcp-connections/create" className="text-primary underline">
              Create one
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {attachments.map((att) => (
            <AttachmentRow
              key={att.id}
              attachment={att}
              onToggle={(isEnabled) =>
                updateAttachment({
                  connectionId: att.mcpConnectionId,
                  payload: { isEnabled },
                })
              }
              onUpdateTools={(enabledToolNames) =>
                updateAttachment({
                  connectionId: att.mcpConnectionId,
                  payload: { enabledToolNames },
                })
              }
              onDetach={() => detachConnection(att.mcpConnectionId)}
              isMutating={isUpdatingAttachment || isDetaching}
            />
          ))}
        </div>
      )}

      <ConnectionPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        attachedIds={attachments.map((a) => a.mcpConnectionId)}
        onAttach={async (id) => {
          await attachConnection({ mcpConnectionId: id, enabledToolNames: null });
          setPickerOpen(false);
        }}
        isAttaching={isAttaching}
      />
    </div>
  );
}

// ============================================================================
// ATTACHMENT ROW
// ============================================================================

function AttachmentRow({
  attachment,
  onToggle,
  onUpdateTools,
  onDetach,
  isMutating,
}: {
  attachment: AttachmentDTO;
  onToggle: (enabled: boolean) => Promise<unknown>;
  onUpdateTools: (toolNames: string[] | null) => Promise<unknown>;
  onDetach: () => Promise<unknown>;
  isMutating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const conn = attachment.mcpConnection;
  const allTools = conn?.discoveredTools?.tools ?? [];
  const enabledNames = attachment.enabledToolNames; // null = all
  const exposedCount = enabledNames === null ? allTools.length : enabledNames.length;

  function toggleTool(name: string, checked: boolean) {
    const current = enabledNames ?? allTools.map((t) => t.name);
    const next = checked
      ? Array.from(new Set([...current, name]))
      : current.filter((n) => n !== name);
    // null = all means: pin the explicit list once the user starts toggling
    onUpdateTools(next.length === allTools.length ? null : next);
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="flex items-center gap-4 p-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/10 shrink-0">
            <Cpu className="size-5 text-indigo-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={`/mcp-connections/${attachment.mcpConnectionId}`}
                className="font-semibold hover:text-primary transition-colors truncate"
              >
                {conn?.name ?? 'Connection'}
              </Link>
              <ExternalLink className="size-3 text-muted-foreground" />
              {conn && <McpStatusChip status={conn.status} />}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <span className="font-mono truncate max-w-[200px]" title={conn?.serverUrl}>
                {conn?.serverUrl}
              </span>
              <span className="flex items-center gap-1">
                <Wrench className="size-3" />
                {exposedCount}/{allTools.length} tool{allTools.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={attachment.isEnabled}
              onCheckedChange={onToggle}
              disabled={isMutating}
            />
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 rounded-lg">
                <ChevronDown className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDetach}
              disabled={isMutating}
              className="size-9 rounded-lg text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-t border-border/50 p-4 bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Filter className="size-3" /> Tool allow-list
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onUpdateTools(null)}
                disabled={enabledNames === null || isMutating}
                className="h-7 text-xs rounded-lg"
              >
                Expose all
              </Button>
            </div>
            {allTools.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No tools discovered. Sync the connection first.
              </p>
            ) : (
              <div className="space-y-2">
                {allTools.map((tool) => {
                  const isEnabled = enabledNames === null || enabledNames.includes(tool.name);
                  return (
                    <label
                      key={tool.name}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-background/60 cursor-pointer"
                    >
                      <Checkbox
                        checked={isEnabled}
                        onCheckedChange={(c) => toggleTool(tool.name, !!c)}
                        disabled={isMutating}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm font-medium">{tool.name}</p>
                        {tool.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {tool.description}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ============================================================================
// CONNECTION PICKER DIALOG
// ============================================================================

function ConnectionPickerDialog({
  open,
  onOpenChange,
  attachedIds,
  onAttach,
  isAttaching,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  attachedIds: string[];
  onAttach: (id: string) => Promise<void>;
  isAttaching: boolean;
}) {
  const { connections, isLoading } = useMcpConnections({ pageSize: 100 });
  const [search, setSearch] = useState('');
  const [attachingId, setAttachingId] = useState<string | null>(null);

  const available = connections.filter(
    (c) =>
      c.isActive &&
      !attachedIds.includes(c.id) &&
      (c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.slug.toLowerCase().includes(search.toLowerCase())),
  );

  async function handlePick(c: McpConnection) {
    setAttachingId(c.id);
    try {
      await onAttach(c.id);
    } finally {
      setAttachingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Attach MCP Connection</DialogTitle>
          <DialogDescription>
            Pick a connection to expose its tools to this experience. You can restrict which tools after attaching.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search connections..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearch('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>

        <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : available.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              {connections.length === 0 ? (
                <>
                  <p>No MCP connections exist yet.</p>
                  <Link href="/mcp-connections/create" className="text-primary underline mt-2 inline-block">
                    Create one
                  </Link>
                </>
              ) : (
                <p>All connections are already attached or filtered out.</p>
              )}
            </div>
          ) : (
            available.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handlePick(c)}
                disabled={isAttaching}
                className="w-full text-left rounded-xl border border-border/50 p-3 hover:border-primary hover:bg-muted/40 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <Cpu className="size-5 text-indigo-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{c.serverUrl}</p>
                  </div>
                  <Badge variant="outline" className="rounded-lg">
                    <Wrench className="mr-1 size-3" />
                    {c.discoveredTools?.tools.length ?? 0}
                  </Badge>
                  {attachingId === c.id && <Loader2 className="size-4 animate-spin" />}
                  {attachingId !== c.id && !isAttaching && <CircleCheck className="size-4 opacity-0 group-hover:opacity-100" />}
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
