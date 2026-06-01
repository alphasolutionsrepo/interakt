'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  RefreshCw,
  Search,
  ChevronRight,
  CheckCircle2,
  Clock,
  Archive,
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
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { PageHeaderSkeleton, TableSkeleton } from '@/shared/ui/custom/skeletons';
import { usePromptTemplates } from '../_lib/hooks/usePromptTemplates';
import type { PromptTemplateStep, PromptTemplate } from '../_lib/api-client';

// ============================================================================
// STEP DISPLAY CONFIG
// ============================================================================

const STEP_LABELS: Record<PromptTemplateStep, { label: string; description: string; color: string }> = {
  turn_planner: {
    label: 'Turn Planner',
    description: 'Plans which tools to call for each user message',
    color: 'bg-blue-500/10 text-blue-600',
  },
  param_extraction: {
    label: 'Param Extraction',
    description: 'Extracts structured parameters for tool calls',
    color: 'bg-amber-500/10 text-amber-600',
  },
  response_synthesis: {
    label: 'Response Synthesis',
    description: 'Generates responses from tool results',
    color: 'bg-green-500/10 text-green-600',
  },
  response_synthesis_direct: {
    label: 'Direct Response',
    description: 'Handles clarifications and direct responses without tools',
    color: 'bg-purple-500/10 text-purple-600',
  },
  response_synthesis_lightweight: {
    label: 'Lightweight Response',
    description: 'Quick responses for greetings and off-topic messages',
    color: 'bg-pink-500/10 text-pink-600',
  },
  agentic_loop: {
    label: 'Agentic Loop',
    description: 'Orchestrates multi-step agentic workflows',
    color: 'bg-cyan-500/10 text-cyan-600',
  },
};

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  active: { icon: CheckCircle2, color: 'text-green-500', label: 'Active' },
  draft: { icon: Clock, color: 'text-amber-500', label: 'Draft' },
  archived: { icon: Archive, color: 'text-muted-foreground', label: 'Archived' },
};

// ============================================================================
// TEMPLATE ROW
// ============================================================================

function TemplateRow({ template, onClick }: { template: PromptTemplate; onClick: () => void }) {
  const status = STATUS_CONFIG[template.status] ?? STATUS_CONFIG.active;
  const StatusIcon = status.icon;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 w-full rounded-lg border border-border/60 bg-card px-4 py-3 text-left transition-all hover:shadow-sm hover:border-border"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {template.label ?? `v${template.version}`}
          </span>
          <Badge variant="outline" className="text-xs shrink-0">
            v{template.version}
          </Badge>
          {template.isSystemDefault && (
            <Badge className="text-xs bg-blue-500/10 text-blue-600 border-blue-200 shrink-0">
              System Default
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className={`flex items-center gap-1 ${status.color}`}>
            <StatusIcon className="size-3" />
            {status.label}
          </span>
          <span>{template.metadata?.variables?.length ?? 0} variables</span>
          <span>{template.metadata?.sections?.length ?? 0} editable sections</span>
          <span>Created {format(new Date(template.createdAt), 'MMM d, yyyy')}</span>
        </div>
      </div>
      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </button>
  );
}

// ============================================================================
// STEP GROUP
// ============================================================================

function StepGroup({
  step,
  templates,
  onTemplateClick,
}: {
  step: PromptTemplateStep;
  templates: PromptTemplate[];
  onTemplateClick: (id: string) => void;
}) {
  const config = STEP_LABELS[step];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Badge className={`${config.color} border-0 text-xs font-medium`}>
          {config.label}
        </Badge>
        <span className="text-xs text-muted-foreground">{config.description}</span>
        <span className="text-xs text-muted-foreground ml-auto">{templates.length} version{templates.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-2">
        {templates.map((t) => (
          <TemplateRow
            key={t.id}
            template={t}
            onClick={() => onTemplateClick(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function PromptTemplatesPage() {
  const router = useRouter();
  const [stepFilter, setStepFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { templates, isLoading, isRefetching, refetch } = usePromptTemplates(
    stepFilter !== 'all' ? { step: stepFilter as PromptTemplateStep } : undefined,
  );

  // Group templates by step
  const grouped = templates.reduce<Record<string, PromptTemplate[]>>((acc, t) => {
    (acc[t.step] ??= []).push(t);
    return acc;
  }, {});

  // Filter by search
  const filteredSteps = Object.entries(grouped)
    .filter(([step, tpls]) => {
      if (!search) return true;
      const lower = search.toLowerCase();
      const config = STEP_LABELS[step as PromptTemplateStep];
      return (
        config?.label.toLowerCase().includes(lower) ||
        tpls.some(
          (t) =>
            t.label?.toLowerCase().includes(lower) ||
            t.content.toLowerCase().includes(lower),
        )
      );
    })
    .sort(([a], [b]) => {
      const order: PromptTemplateStep[] = [
        'turn_planner', 'param_extraction', 'response_synthesis',
        'response_synthesis_direct', 'response_synthesis_lightweight', 'agentic_loop',
      ];
      return order.indexOf(a as PromptTemplateStep) - order.indexOf(b as PromptTemplateStep);
    });

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <PageHeaderSkeleton />
        <TableSkeleton rows={5} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        variant="hero"
        title="Prompt Templates"
        description="View and manage the AI prompts used across all pipeline steps. Each prompt is versioned — create new versions, compare, and rollback."
        icon={FileText}
        iconBg="bg-violet-500/10"
        iconColor="text-violet-500"
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={stepFilter} onValueChange={setStepFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All steps" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All steps</SelectItem>
            {Object.entries(STEP_LABELS).map(([step, config]) => (
              <SelectItem key={step} value={step}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon"
          onClick={() => refetch()}
          disabled={isRefetching}
        >
          <RefreshCw className={`size-4 ${isRefetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Content */}
      {filteredSteps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="size-12 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">
            {search ? 'No templates match your search.' : 'No prompt templates found. Run the seeder to create system defaults.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {filteredSteps.map(([step, tpls]) => (
            <StepGroup
              key={step}
              step={step as PromptTemplateStep}
              templates={tpls}
              onTemplateClick={(id) => router.push(`/prompt-templates/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
