'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  Edit2,
  Power,
  PowerOff,
  Bot,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CircleCheck,
  CircleDashed,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { DeleteConfirmDialog } from '@/shared/ui/custom/DeleteConfirmDialog';
import { ToolTypeChip, resolveToolChipConfig } from '../../_components/ToolTypeChip';
import { LookupFieldsWarnings } from '../../_components/LookupFieldsSection';
import { useLookupFields, useTool } from '../../_lib/hooks/useTools';
import { ActionButton } from '@/shared/access/ActionControls';
import { DangerZone } from '@/shared/ui/custom/DangerZone';
import { ToolTestPanel } from '../../_components/ToolTestPanel';

// ============================================================================
// CONFIG DISPLAY
// ============================================================================

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

function ConfigDisplay({ tool }: { tool: { executorType: string; operation: string | null; executorConfig: Record<string, unknown> | null; dataSourceId: string | null } }) {
  const config = tool.executorConfig ?? {};
  const executorType = tool.executorType;

  if (executorType === 'data_source') {
    return (
      <div>
        {tool.dataSourceId && (
          <ConfigRow label="Data Source" value={
            <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{tool.dataSourceId}</code>
          } />
        )}
        {tool.operation && <ConfigRow label="Operation" value={<Badge variant="outline" className="rounded-lg text-xs font-mono">{tool.operation}</Badge>} />}
        {config.maxResults && <ConfigRow label="Default Max Results" value={String(config.maxResults)} />}
        {Array.isArray(config.responseFields) && config.responseFields.length > 0 && (
          <ConfigRow label="Response Fields" value={(config.responseFields as string[]).join(', ')} />
        )}
        {config.includeHighlights === false && (
          <ConfigRow label="Highlights" value="Disabled" />
        )}
        {Array.isArray(config.nameFields) && config.nameFields.length > 0 && (
          <ConfigRow label="Name Fields" value={(config.nameFields as string[]).join(', ')} />
        )}
        {Array.isArray(config.codeFields) && config.codeFields.length > 0 && (
          <ConfigRow label="Code Fields" value={(config.codeFields as string[]).join(', ')} />
        )}
        {typeof config.idField === 'string' && config.idField && <ConfigRow label="ID Field" value={config.idField} />}
      </div>
    );
  }
  if (executorType === 'http') {
    return (
      <div>
        {config.baseUrl && <ConfigRow label="Base URL" value={<code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded break-all">{config.baseUrl as string}</code>} />}
        {config.method && <ConfigRow label="Method" value={<Badge variant="outline" className="rounded-lg text-xs font-mono">{config.method as string}</Badge>} />}
        {config.timeout && <ConfigRow label="Timeout" value={`${config.timeout}ms`} />}
        {config.retries !== undefined && <ConfigRow label="Retries" value={String(config.retries)} />}
      </div>
    );
  }
  if (executorType === 'ai_call') {
    return (
      <div>
        {config.instructions && <ConfigRow label="Instructions" value={
          <span className="text-sm text-muted-foreground line-clamp-3">{config.instructions as string}</span>
        } />}
        {config.temperature !== undefined && <ConfigRow label="Temperature" value={String(config.temperature)} />}
        {config.maxTokens !== undefined && <ConfigRow label="Max Tokens" value={String(config.maxTokens)} />}
      </div>
    );
  }
  return <pre className="text-xs font-mono bg-muted p-3 rounded-xl overflow-auto">{JSON.stringify(config, null, 2)}</pre>;
}

// ============================================================================
// PAGE
// ============================================================================

export default function ToolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { tool, isLoading, isError, updateTool, deleteTool, isUpdating, isDeleting, experiences } = useTool(id);
  const { status: lookupFields } = useLookupFields(tool?.operation === 'lookup' ? id : undefined, tool?.dataSourceId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex-1 p-6 lg:p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-16 bg-muted rounded-2xl" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded-2xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !tool) {
    return (
      <div className="flex-1 p-6 lg:p-8 text-center text-muted-foreground">
        <p>Tool not found.</p>
        <Link href="/tools" className="text-primary underline mt-2 inline-block">Back to Tools</Link>
      </div>
    );
  }

  const cfg = resolveToolChipConfig(tool);
  const Icon = cfg?.icon;

  async function handleToggleActive() {
    await updateTool({ isActive: !tool!.isActive });
  }

  async function handleDelete() {
    try {
      await deleteTool();
      router.push('/tools');
    } catch {
      // Error toast is shown by the mutation's onError handler
    }
  }

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      {/* Header */}
      <PageHeader
        variant="detail"
        title={tool.name}
        description={tool.description ?? undefined}
        breadcrumb={
          <>
            <Link href="/tools" className="hover:text-foreground transition-colors font-medium">Tools</Link>
            <ChevronRight className="size-3.5" />
            <span className="text-foreground font-medium truncate max-w-[200px]">{tool.name}</span>
          </>
        }
        customIcon={
          Icon && (
            <div className="relative">
              <div className={`flex size-12 items-center justify-center rounded-xl ${cfg.iconBg}`}>
                <Icon className={`size-6 ${cfg.iconClass}`} />
              </div>
              {tool.isActive && (
                <div className="absolute -right-0.5 -bottom-0.5 size-4 rounded-full bg-emerald-500 ring-2 ring-background" />
              )}
            </div>
          )
        }
        badge={<ToolTypeChip executorType={tool.executorType} operation={tool.operation} />}
        actions={
          <>
            <ActionButton
              action="tools.edit"
              builtIn={tool.isBuiltIn}
              icon={tool.isActive ? PowerOff : Power}
              iconClassName="size-4 mr-2"
              variant={tool.isActive ? 'outline' : 'default'}
              className={`rounded-xl ${!tool.isActive ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
              onClick={handleToggleActive}
              disabled={isUpdating}
            >
              {tool.isActive ? 'Deactivate' : 'Activate'}
            </ActionButton>
            <ActionButton action="tools.edit" builtIn={tool.isBuiltIn} icon={Edit2} iconClassName="size-4 mr-2" variant="outline" className="rounded-xl" onClick={() => router.push(`/tools/${id}/edit`)}>
              Edit
            </ActionButton>
          </>
        }
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Type', value: <ToolTypeChip executorType={tool.executorType} operation={tool.operation} /> },
          {
            label: 'Status',
            value: tool.isActive ? (
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 rounded-lg px-2.5 py-1 text-xs font-semibold">
                <CircleCheck className="mr-1.5 size-3.5" />Active
              </Badge>
            ) : (
              <Badge variant="outline" className="rounded-lg px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                <CircleDashed className="mr-1.5 size-3.5" />Inactive
              </Badge>
            ),
          },
          { label: 'Used In', value: <span className="text-2xl font-bold">{experiences.length}</span> },
          { label: 'Created', value: <span className="text-sm font-medium">{format(new Date(tool.createdAt), 'MMM d, yyyy')}</span> },
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
            <CardDescription>Type-specific settings for this tool.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ConfigDisplay tool={tool} />
            {lookupFields && !lookupFields.configured && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                Needs setup: choose the fields Find Record matches on (Edit) before adding this tool to an AI
                experience. Experiences that already use it keep working.
              </p>
            )}
            {lookupFields && <LookupFieldsWarnings status={lookupFields} />}
          </CardContent>
        </Card>

        {/* AI Description */}
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Bot className="size-4 text-violet-500" />
              AI Description
            </CardTitle>
            <CardDescription>How the AI decides when to call this tool.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">{tool.aiDescription}</p>

            {(tool.inputSchema || tool.outputSchema) && (
              <>
                <Separator />
                <button
                  onClick={() => setSchemaOpen(!schemaOpen)}
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {schemaOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  {schemaOpen ? 'Hide' : 'Show'} Schemas
                </button>
                {schemaOpen && (
                  <div className="space-y-3">
                    {tool.inputSchema && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Input Schema</p>
                        <pre className="text-xs font-mono bg-muted p-3 rounded-xl overflow-auto max-h-48">
                          {JSON.stringify(tool.inputSchema, null, 2)}
                        </pre>
                      </div>
                    )}
                    {tool.outputSchema && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Output Schema</p>
                        <pre className="text-xs font-mono bg-muted p-3 rounded-xl overflow-auto max-h-48">
                          {JSON.stringify(tool.outputSchema, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Test Panel */}
      {/* Run is locked with the reason for a role that can't test (it calls the tool: playground:use) */}
      <ToolTestPanel toolId={id} isActive={tool.isActive} executorType={tool.executorType} operation={tool.operation} />

      {/* Used in AI Experiences */}
      {experiences.length > 0 && (
        <Card className="border-border/60 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Used in AI Experiences</CardTitle>
            <CardDescription>{experiences.length} experience{experiences.length !== 1 ? 's' : ''} use this tool.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {experiences.map((exp) => (
              <div key={exp.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-border/50">
                <div className="flex items-center gap-3">
                  <div className={`size-2 rounded-full ${exp.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                  <div>
                    <p className="text-sm font-medium">{exp.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{exp.slug}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="rounded-lg gap-1.5 text-xs" onClick={() => router.push(`/experiences/ai/${exp.id}`)}>
                  View <ExternalLink className="size-3" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Danger Zone */}
      <DangerZone
        thing="tool"
        detail={experiences.length > 0
          ? `This tool is used by ${experiences.length} experience${experiences.length !== 1 ? 's' : ''}. Remove it from all experiences first.`
          : 'Permanently deletes this tool. This action cannot be undone.'}
        action="tools.delete"
        builtIn={tool.isBuiltIn}
        onDelete={() => setDeleteOpen(true)}
        disabled={experiences.length > 0}
      />

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Tool"
        itemName={tool.name}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
