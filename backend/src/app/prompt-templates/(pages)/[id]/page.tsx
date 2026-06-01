'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FileText,
  ChevronRight,
  Variable,
  Layers,
  History,
  CheckCircle2,
  Clock,
  Archive,
  RotateCcw,
  Copy,
  Check,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { PageHeaderSkeleton } from '@/shared/ui/custom/skeletons';
import { usePromptTemplate } from '../../_lib/hooks/usePromptTemplates';
import type { PromptTemplate, PromptVariable, PromptSection } from '../../_lib/api-client';

// ============================================================================
// STEP LABELS
// ============================================================================

const STEP_LABELS: Record<string, { label: string; color: string }> = {
  turn_planner: { label: 'Turn Planner', color: 'bg-blue-500/10 text-blue-600' },
  param_extraction: { label: 'Param Extraction', color: 'bg-amber-500/10 text-amber-600' },
  response_synthesis: { label: 'Response Synthesis', color: 'bg-green-500/10 text-green-600' },
  response_synthesis_direct: { label: 'Direct Response', color: 'bg-purple-500/10 text-purple-600' },
  response_synthesis_lightweight: { label: 'Lightweight Response', color: 'bg-pink-500/10 text-pink-600' },
  agentic_loop: { label: 'Agentic Loop', color: 'bg-cyan-500/10 text-cyan-600' },
};

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  active: { icon: CheckCircle2, color: 'text-green-500', label: 'Active' },
  draft: { icon: Clock, color: 'text-amber-500', label: 'Draft' },
  archived: { icon: Archive, color: 'text-muted-foreground', label: 'Archived' },
};

const SOURCE_COLORS: Record<string, string> = {
  pipeline_context: 'bg-blue-500/10 text-blue-600 border-blue-200',
  experience_config: 'bg-green-500/10 text-green-600 border-green-200',
  tool_schema: 'bg-amber-500/10 text-amber-600 border-amber-200',
  action_results: 'bg-purple-500/10 text-purple-600 border-purple-200',
};

// ============================================================================
// PROMPT CONTENT VIEWER
// ============================================================================

function PromptContentViewer({
  content,
  sections,
  variables,
}: {
  content: string;
  sections: PromptSection[];
  variables: PromptVariable[];
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Highlight variables and sections in the content
  const highlightedContent = highlightPromptContent(content, sections, variables);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">Prompt Content</CardTitle>
        <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-1.5">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="relative rounded-lg border bg-muted/30 p-4 overflow-auto max-h-[600px]">
          <pre className="text-sm leading-relaxed whitespace-pre-wrap font-mono">
            {highlightedContent}
          </pre>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-blue-500/20 border border-blue-300" />
            Variables
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-amber-500/20 border border-amber-300" />
            Editable Sections
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-gray-500/20 border border-gray-300" />
            Conditionals
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Apply syntax highlighting to prompt template content.
 * Returns React elements with colored spans for variables, sections, and conditionals.
 */
function highlightPromptContent(
  content: string,
  sections: PromptSection[],
  variables: PromptVariable[],
): React.ReactNode[] {
  // Split content into tokens for highlighting
  const parts: React.ReactNode[] = [];
  const remaining = content;
  let key = 0;

  // Regex to match all template constructs
  const pattern = /(\{\{#if\s+\w+\}\}|\{\{\/if\}\}|\{\{\w+\}\}|<!-- section:\w+ -->|<!-- \/section:\w+ -->)/g;
  let match;
  let lastIndex = 0;

  const allMatches: Array<{ index: number; length: number; text: string; type: string }> = [];

  while ((match = pattern.exec(content)) !== null) {
    let type = 'variable';
    if (match[0].startsWith('{{#if') || match[0].startsWith('{{/if')) {
      type = 'conditional';
    } else if (match[0].startsWith('<!--')) {
      type = 'section';
    }
    allMatches.push({ index: match.index, length: match[0].length, text: match[0], type });
  }

  for (const m of allMatches) {
    // Text before this match
    if (m.index > lastIndex) {
      parts.push(<span key={key++}>{content.slice(lastIndex, m.index)}</span>);
    }

    // The matched token
    const colorClass =
      m.type === 'variable'
        ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 rounded px-0.5'
        : m.type === 'section'
          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 rounded px-0.5'
          : 'bg-gray-500/15 text-gray-600 dark:text-gray-400 rounded px-0.5';

    parts.push(
      <span key={key++} className={colorClass}>
        {m.text}
      </span>,
    );

    lastIndex = m.index + m.length;
  }

  // Remaining text
  if (lastIndex < content.length) {
    parts.push(<span key={key++}>{content.slice(lastIndex)}</span>);
  }

  return parts;
}

// ============================================================================
// VARIABLE LEGEND
// ============================================================================

function VariableLegend({ variables }: { variables: PromptVariable[] }) {
  if (!variables.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Variable className="size-4" />
          Variables ({variables.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {variables.map((v) => (
            <div key={v.name} className="flex items-start gap-3">
              <code className="text-xs font-mono bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                {`{{${v.name}}}`}
              </code>
              <div className="min-w-0">
                <p className="text-sm">{v.description}</p>
                <Badge variant="outline" className={`text-[10px] mt-1 ${SOURCE_COLORS[v.source] ?? ''}`}>
                  {v.source.replace(/_/g, ' ')}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// EDITABLE SECTIONS
// ============================================================================

function SectionsList({ sections }: { sections: PromptSection[] }) {
  if (!sections.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Layers className="size-4" />
          Editable Sections ({sections.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sections.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2">
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200 text-xs">
                {s.id}
              </Badge>
              <span className="text-sm">{s.label}</span>
              {s.editable && (
                <Badge className="text-[10px] bg-green-500/10 text-green-600 border-0 ml-auto">
                  Editable
                </Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// VERSION HISTORY
// ============================================================================

function VersionHistory({
  history,
  currentId,
  onRollback,
  isRollingBack,
}: {
  history: PromptTemplate[];
  currentId: string;
  onRollback: (targetId: string) => void;
  isRollingBack: boolean;
}) {
  if (!history.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <History className="size-4" />
          Version History ({history.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {history.map((v, i) => {
            const isCurrent = v.id === currentId;
            return (
              <div
                key={v.id}
                className={`flex items-center gap-3 py-2 px-3 rounded-lg ${
                  isCurrent ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">v{v.version}</span>
                    {v.isSystemDefault && (
                      <Badge className="text-[10px] bg-blue-500/10 text-blue-600 border-0">
                        Default
                      </Badge>
                    )}
                    {isCurrent && (
                      <Badge className="text-[10px] bg-primary/10 text-primary border-0">
                        Viewing
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {v.label ?? 'No description'}
                    {' · '}
                    {format(new Date(v.createdAt), 'MMM d, yyyy HH:mm')}
                  </p>
                </div>
                {!isCurrent && !v.isSystemDefault && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          onClick={() => onRollback(v.id)}
                          disabled={isRollingBack}
                        >
                          <RotateCcw className="size-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Make this the system default</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {!isCurrent && (
                  <Link href={`/prompt-templates/${v.id}`}>
                    <Button variant="ghost" size="icon" className="size-8 shrink-0">
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function PromptTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const {
    template,
    isLoading,
    history,
    isLoadingHistory,
    rollback,
    isRollingBack,
  } = usePromptTemplate(id);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <PageHeaderSkeleton />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <FileText className="size-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground mb-4">Template not found.</p>
        <Button variant="outline" onClick={() => router.push('/prompt-templates')}>
          Back to Templates
        </Button>
      </div>
    );
  }

  const stepConfig = STEP_LABELS[template.step] ?? { label: template.step, color: '' };
  const status = STATUS_CONFIG[template.status] ?? STATUS_CONFIG.active;
  const StatusIcon = status.icon;

  const handleRollback = async (targetId: string) => {
    try {
      await rollback({ targetVersionId: targetId });
    } catch {
      // Error toast handled by the hook
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        variant="detail"
        title={template.label ?? `${stepConfig.label} v${template.version}`}
        description={`Version ${template.version} of the ${stepConfig.label.toLowerCase()} prompt template`}
        breadcrumb={
          <>
            <Link href="/prompt-templates" className="text-muted-foreground hover:text-foreground transition-colors">
              Prompt Templates
            </Link>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span>{stepConfig.label}</span>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span>v{template.version}</span>
          </>
        }
        customIcon={
          <div className="flex size-12 items-center justify-center rounded-xl bg-violet-500/10">
            <FileText className="size-6 text-violet-500" />
          </div>
        }
        badge={
          <div className="flex items-center gap-2">
            <Badge className={`${stepConfig.color} border-0 text-xs`}>
              {stepConfig.label}
            </Badge>
            <span className={`flex items-center gap-1 text-xs ${status.color}`}>
              <StatusIcon className="size-3" />
              {status.label}
            </span>
            {template.isSystemDefault && (
              <Badge className="text-xs bg-blue-500/10 text-blue-600 border-blue-200">
                System Default
              </Badge>
            )}
          </div>
        }
      />

      {/* Two-column layout: content + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <PromptContentViewer
            content={template.content}
            sections={template.metadata?.sections ?? []}
            variables={template.metadata?.variables ?? []}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <VariableLegend variables={template.metadata?.variables ?? []} />
          <SectionsList sections={template.metadata?.sections ?? []} />
          <VersionHistory
            history={history}
            currentId={id}
            onRollback={handleRollback}
            isRollingBack={isRollingBack}
          />
        </div>
      </div>
    </div>
  );
}
