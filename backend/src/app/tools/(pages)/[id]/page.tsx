'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  Edit2,
  Power,
  PowerOff,
  Trash2,
  Bot,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CircleCheck,
  CircleDashed,
  FlaskConical,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { DeleteConfirmDialog } from '@/shared/ui/custom/DeleteConfirmDialog';
import { ToolTypeChip, resolveToolChipConfig } from '../../_components/ToolTypeChip';
import { useTool } from '../../_lib/hooks/useTools';

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
// TEST PANEL
// ============================================================================

interface TestResult {
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}

function ToolTestPanel({ toolId, isActive, executorType, operation }: {
  toolId: string;
  isActive: boolean;
  executorType: string;
  operation?: string | null;
}) {
  const [query, setQuery] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [lookupId, setLookupId] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  // Build the correct input object based on operation type
  function buildInput(): Record<string, unknown> | null {
    if (executorType === 'data_source') {
      if (operation === 'inspect') return {};
      if (operation === 'enumerate') {
        if (!fieldName.trim()) return null;
        return { field: fieldName.trim() };
      }
      if (operation === 'lookup') {
        if (!lookupId.trim()) return null;
        return { id: lookupId.trim() };
      }
      // search (default)
      if (!query.trim()) return null;
      return { query: query.trim() };
    }
    if (executorType === 'ai_call') {
      if (!query.trim()) return null;
      return { input: query.trim() };
    }
    if (!query.trim()) return null;
    return { query: query.trim() };
  }

  const canRun = isActive && !running && (() => {
    if (!isActive) return false;
    if (operation === 'inspect') return true;
    if (operation === 'enumerate') return !!fieldName.trim();
    if (operation === 'lookup') return !!lookupId.trim();
    return !!query.trim();
  })();

  async function handleRun() {
    const input = buildInput();
    if (input === null || running) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`/api/tools/${toolId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });
      const json = await res.json() as { data: TestResult };
      setResult(json.data);
    } catch (err) {
      setResult({ success: false, error: (err as Error).message, durationMs: 0 });
    } finally {
      setRunning(false);
    }
  }

  const runButton = (
    <Button className="rounded-xl shrink-0" onClick={handleRun} disabled={!canRun}>
      {running ? <><Loader2 className="size-4 mr-2 animate-spin" />Running…</> : <><Play className="size-4 mr-2" />Run</>}
    </Button>
  );

  return (
    <Card className="border-border/60 shadow-sm rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <FlaskConical className="size-4 text-amber-500" />
          Test Tool
        </CardTitle>
        <CardDescription>
          Run a live query to verify this tool is configured correctly.
          {!isActive && <span className="text-amber-500 ml-1">— Tool must be active to test.</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Input — varies by operation type */}
        {operation === 'inspect' ? (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm text-muted-foreground italic">No input required — returns the full schema.</p>
            {runButton}
          </div>
        ) : operation === 'enumerate' ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRun(); }}
                placeholder="Field name to enumerate, e.g. category, brand, size…"
                className="rounded-xl font-mono text-sm"
                disabled={!isActive || running}
              />
              {runButton}
            </div>
            <p className="text-xs text-muted-foreground">Enter the exact field name whose distinct values you want to list.</p>
          </div>
        ) : operation === 'lookup' ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRun(); }}
                placeholder="Document ID to look up…"
                className="rounded-xl font-mono text-sm"
                disabled={!isActive || running}
              />
              {runButton}
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRun(); }}
              placeholder={executorType === 'ai_call' ? 'Enter a prompt or question…' : 'Enter a search query…'}
              className="rounded-xl font-mono text-sm"
              disabled={!isActive || running}
            />
            {runButton}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-2">
            {/* Status bar */}
            <div className="flex items-center gap-3 text-sm">
              {result.success ? (
                <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                  <CheckCircle2 className="size-4" />Success
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-destructive font-medium">
                  <XCircle className="size-4" />Error
                </span>
              )}
              <span className="flex items-center gap-1 text-muted-foreground text-xs">
                <Clock className="size-3" />{result.durationMs}ms
              </span>
            </div>

            {/* Error message */}
            {!result.success && result.error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive font-mono">
                {result.error}
              </div>
            )}

            {/* Response JSON */}
            {result.success && result.data !== undefined && (
              <pre className="text-xs font-mono bg-muted/60 border border-border/60 p-4 rounded-xl overflow-auto max-h-96 leading-relaxed">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// PAGE
// ============================================================================

export default function ToolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { tool, isLoading, isError, updateTool, deleteTool, isUpdating, isDeleting, experiences } = useTool(id);
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
            <Button
              variant={tool.isActive ? 'outline' : 'default'}
              className={`rounded-xl ${!tool.isActive ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
              onClick={handleToggleActive}
              disabled={isUpdating}
            >
              {tool.isActive ? (
                <><PowerOff className="size-4 mr-2" />Deactivate</>
              ) : (
                <><Power className="size-4 mr-2" />Activate</>
              )}
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={() => router.push(`/tools/${id}/edit`)}>
              <Edit2 className="size-4 mr-2" />Edit
            </Button>
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
          <CardContent>
            <ConfigDisplay tool={tool} />
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
      <Card className="border-destructive/30 shadow-sm rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 font-semibold text-destructive">
            <Trash2 className="size-4" />Danger Zone
          </CardTitle>
          <CardDescription>Irreversible actions that permanently affect this tool.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-destructive/5 rounded-xl border border-destructive/20">
            <div>
              <p className="font-medium text-sm">Delete this tool</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {experiences.length > 0
                  ? `This tool is used by ${experiences.length} experience${experiences.length !== 1 ? 's' : ''}. Remove it from all experiences first.`
                  : 'Permanently deletes this tool. This action cannot be undone.'}
              </p>
            </div>
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={() => setDeleteOpen(true)}
              disabled={experiences.length > 0}
            >
              <Trash2 className="size-4 mr-2" />Delete
            </Button>
          </div>
        </CardContent>
      </Card>

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
