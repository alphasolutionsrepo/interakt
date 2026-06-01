'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronRight, Edit2, Power, PowerOff, Trash2, Key,
  RefreshCw, Copy, Check, CircleCheck, CircleDashed,
  Wrench, Bot, Shield, Thermometer,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { DeleteConfirmDialog } from '@/shared/ui/custom/DeleteConfirmDialog';
import { ChatWidgetCard } from './ChatWidgetCard';
import { CollapsibleCard } from '@/shared/ui/custom/CollapsibleCard';
import { PipelineModeChip } from './PipelineModeChip';
import { ToolAssignmentPanel } from './ToolAssignmentPanel';
import { McpAttachmentPanel } from './McpAttachmentPanel';
import { ChatTestPanel } from './ChatTestPanel';
import { PipelineStepsCard } from './PipelineStepsCard';
import { useAIExperience } from '../_lib/hooks/useAIExperiences';

// ============================================================================
// COPY BUTTON
// ============================================================================

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Button variant="ghost" size="icon" className="size-8 rounded-lg shrink-0" onClick={handleCopy} title={label}>
      {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

// ============================================================================
// AI EXPERIENCE DETAIL
// ============================================================================

export function AIExperienceDetail({ id, basePath = '/ai-experiences', listPath }: { id: string; basePath?: string; listPath?: string }) {
  const listHref = listPath ?? basePath;
  const router = useRouter();
  const {
    experience, isLoading, isError, refetch,
    updateExperience, deleteExperience, regenerateToken,
    assignTool, updateToolAssignment, removeTool,
    isUpdating, isDeleting, isRegeneratingToken, isAssigningTool, isRemovingTool,
  } = useAIExperience(id);

  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex-1 p-6 lg:p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-16 bg-muted rounded-2xl" />
          <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map((i) => <div key={i} className="h-24 bg-muted rounded-2xl" />)}</div>
        </div>
      </div>
    );
  }

  if (isError || !experience) {
    return (
      <div className="flex-1 p-6 lg:p-8 text-center text-muted-foreground">
        <p>AI Experience not found.</p>
        <Link href={listHref} className="text-primary underline mt-2 inline-block">Back to Experiences</Link>
      </div>
    );
  }

  const persona = (experience.personaConfig ?? {}) as Record<string, unknown>;
  const session = (experience.sessionConfig ?? {}) as Record<string, unknown>;
  const ac = (experience.accessConfig ?? {}) as Record<string, unknown>;
  const rl = (ac?.rateLimits ?? {}) as Record<string, unknown>;

  async function handleToggleActive() {
    await updateExperience({ isActive: !experience!.isActive });
  }

  async function handleDelete() {
    await deleteExperience();
    router.push(listHref);
  }

  async function handleRegenerateToken() {
    await regenerateToken();
  }

  async function handleAssignTool(payload: Parameters<typeof assignTool>[0]) {
    await assignTool(payload);
    await refetch();
  }

  async function handleUpdateToolAssignment(toolId: string, data: Parameters<typeof updateToolAssignment>[0]['data']) {
    await updateToolAssignment({ toolId, data });
  }

  async function handleRemoveTool(toolId: string) {
    await removeTool(toolId);
    await refetch();
  }

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Header */}
      <PageHeader
        variant="detail"
        title={experience.name}
        description={experience.description ?? undefined}
        breadcrumb={
          <>
            <Link href={listHref} className="hover:text-foreground transition-colors font-medium">Experiences</Link>
            <ChevronRight className="size-3.5" />
            <span className="text-foreground font-medium truncate max-w-[200px]">{experience.name}</span>
          </>
        }
        customIcon={
          <div className="relative">
            <div className={`flex size-12 items-center justify-center rounded-xl ${experience.isActive ? 'bg-primary/10 ring-1 ring-primary/20' : 'bg-muted/50 ring-1 ring-border/50'}`}>
              <Bot className={`size-6 ${experience.isActive ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            {experience.isActive && <div className="absolute -right-0.5 -bottom-0.5 size-4 rounded-full bg-emerald-500 ring-2 ring-background" />}
          </div>
        }
        badge={<PipelineModeChip mode={experience.pipelineMode} />}
        actions={
          <>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={handleRegenerateToken} disabled={isRegeneratingToken}>
              <RefreshCw className={`size-3.5 mr-1.5 ${isRegeneratingToken ? 'animate-spin' : ''}`} />
              Regenerate Token
            </Button>
            <Button
              variant={experience.isActive ? 'outline' : 'default'}
              className={`rounded-xl ${!experience.isActive ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
              onClick={handleToggleActive} disabled={isUpdating}
            >
              {experience.isActive ? <><PowerOff className="size-4 mr-2" />Deactivate</> : <><Power className="size-4 mr-2" />Activate</>}
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={() => router.push(`${basePath}/${id}/edit`)}>
              <Edit2 className="size-4 mr-2" />Edit
            </Button>
          </>
        }
      />

      {/* Stats Strip */}
      <Card className="border-border/60 shadow-sm rounded-2xl overflow-hidden">
        <div className="flex divide-x divide-border/50">
          {[
            {
              label: 'Tools',
              value: (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold tabular-nums">{experience.tools.length}</span>
                  <span className="text-xs text-muted-foreground font-medium">assigned</span>
                </div>
              ),
            },
            {
              label: 'Pipeline',
              value: <PipelineModeChip mode={experience.pipelineMode} />,
            },
            {
              label: 'Status',
              value: experience.isActive ? (
                <div className="flex items-center gap-1.5">
                  <CircleCheck className="size-3.5 text-emerald-500" />
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Active</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <CircleDashed className="size-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold text-muted-foreground">Inactive</span>
                </div>
              ),
            },
            {
              label: 'Created',
              value: <span className="text-sm font-semibold">{format(new Date(experience.createdAt), 'MMM d, yyyy')}</span>,
            },
          ].map(({ label, value }, i) => (
            <div key={i} className="flex-1 px-5 py-4 min-w-0">
              <p className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase mb-1.5">{label}</p>
              {value}
            </div>
          ))}
        </div>
      </Card>

      {/* Chat Test Panel */}
      <ChatTestPanel experienceSlug={experience.slug} experienceName={experience.name} />

      {/* Pipeline Configuration */}
      <PipelineStepsCard
        pipelineMode={experience.pipelineMode}
        personaConfig={persona}
        sessionConfig={session}
        guardrailConfig={experience.guardrailConfig as Record<string, unknown> | null}
        onUpdate={async (payload) => { await updateExperience(payload); }}
        isUpdating={isUpdating}
      />

      {/* Tool Assignments */}
      <CollapsibleCard
        icon={<Wrench className="size-4 text-orange-500" />}
        title={`Assigned Tools (${experience.tools.length})`}
        description="Tools available to this experience. Enable/disable per tool, or override the AI description."
      >
        <ToolAssignmentPanel
          experienceId={id}
          assignments={experience.tools}
          onAssign={handleAssignTool}
          onUpdateAssignment={handleUpdateToolAssignment}
          onRemove={handleRemoveTool}
          isAssigning={isAssigningTool}
          isRemovingTool={isRemovingTool}
        />
      </CollapsibleCard>

      {/* MCP Connection Attachments */}
      <CollapsibleCard
        icon={<Bot className="size-4 text-indigo-500" />}
        title="MCP Connections"
        description="Attach Model Context Protocol servers to bring their tools into this experience. Tools are discovered live and merged with regular tools."
      >
        <McpAttachmentPanel experienceId={id} />
      </CollapsibleCard>

      {/* AI Configuration + Access Control — two collapsible cards side by side. */}
      <div className="grid md:grid-cols-2 gap-6">
        <CollapsibleCard
          icon={<Thermometer className="size-4 text-violet-500" />}
          title="AI Configuration"
        >
          <div className="space-y-3">
            {persona.systemInstructions && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">System Instructions</p>
                <p className="text-sm text-muted-foreground line-clamp-3">{persona.systemInstructions as string}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Tone', String((persona.tone as string) ?? 'professional').replace(/^\w/, (c) => c.toUpperCase())],
                ['Provider', experience.providerId ? String(experience.providerId) : 'System Default'],
                ['Model', experience.modelId ? String(experience.modelId) : 'System Default'],
                ['Context Messages', String((session.maxContextMessages as number) ?? 20)],
              ].map(([label, value]) => (
                <div key={label} className="bg-muted/30 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className="text-sm font-semibold mt-0.5 font-mono">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          icon={<Shield className="size-4 text-blue-500" />}
          title="Access Control"
        >
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Allowed Origins</p>
              {!(ac?.allowedOrigins as string[])?.length ? (
                <p className="text-sm text-muted-foreground italic">All origins allowed</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(ac.allowedOrigins as string[]).map((origin) => (
                    <Badge key={origin} variant="secondary" className="rounded-lg font-mono text-xs">{origin}</Badge>
                  ))}
                </div>
              )}
            </div>
            {rl && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Rate Limits</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/30 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">Per Minute</p>
                    <p className="text-sm font-semibold mt-0.5">{(rl.chatPerMinute as number) ?? 60} req</p>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground">Per Day</p>
                    <p className="text-sm font-semibold mt-0.5">{(rl.requestsPerDay as number) ?? 'Unlimited'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CollapsibleCard>
      </div>

      {/* ──────────────────────────────────────────────────────────────────
          Distribution — how end users actually reach this experience.
          Access token, welcome content, and the embed snippet all live here
          so admins configure the experience first, then set up how it's
          consumed.
          ────────────────────────────────────────────────────────────────── */}
      <div className="pt-4 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border/60" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Distribution
          </span>
          <div className="h-px flex-1 bg-border/60" />
        </div>

        {/* Access Token */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/60 bg-muted/30">
          <Key className="size-4 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium">Access Token</span>
            <span className="text-xs text-muted-foreground ml-2">••••••••{experience.accessToken.slice(-8)}</span>
          </div>
          <CopyButton text={experience.accessToken} label="Copy access token" />
        </div>

        {/* Chat Widget — one collapsible card with snippet + content + styling */}
        <ChatWidgetCard
          accessToken={experience.accessToken}
          accessConfig={experience.accessConfig as Record<string, unknown> | null}
          onSave={async (nextAccessConfig) => {
            await updateExperience({ accessConfig: nextAccessConfig as Record<string, unknown> });
          }}
          isSaving={isUpdating}
          defaultContainerId="interakt-chat"
        />
      </div>

      {/* Danger Zone */}
      <CollapsibleCard
        className="border-destructive/30"
        icon={<Trash2 className="size-4 text-destructive" />}
        title={<span className="text-destructive">Danger Zone</span>}
        description="Irreversible actions that permanently affect this AI experience."
      >
        <div className="flex items-center justify-between p-4 bg-destructive/5 rounded-xl border border-destructive/20">
          <div>
            <p className="font-medium text-sm">Delete this AI experience</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Permanently deletes the experience and all tool assignments.
            </p>
          </div>
          <Button variant="destructive" className="rounded-xl" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4 mr-2" />Delete
          </Button>
        </div>
      </CollapsibleCard>

      <DeleteConfirmDialog
        open={deleteOpen} onOpenChange={setDeleteOpen}
        title="Delete AI Experience" itemName={experience.name}
        onConfirm={handleDelete} isLoading={isDeleting} />
    </div>
  );
}
