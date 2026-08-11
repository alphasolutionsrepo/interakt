'use client';

/**
 * Per-experience prompt template assignment.
 *
 * Each pipeline step resolves its prompt through `prompt_templates`: a per-experience
 * override if one exists, otherwise the system default. The override API and the resolver
 * have both existed since prompt templates shipped — with nothing in the UI calling them,
 * so pointing one experience's planner at a custom template required a hand-written SQL
 * statement against `ai_experience_prompt_overrides`.
 *
 * That is the gap this closes. It is deliberately assignment-only: authoring and versioning
 * templates already have a dedicated editor, and duplicating that here would give two
 * places to change the same content.
 */

import { ExternalLink, RotateCcw } from 'lucide-react';
import Link from 'next/link';

import type { PromptTemplate, PromptTemplateStep } from '@/app/prompt-templates/_lib/api-client';
import { usePromptTemplates, useSystemDefaults, useExperienceOverrides } from '@/app/prompt-templates/_lib/hooks/usePromptTemplates';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Steps offered here, with what each one decides.
 *
 * `agentic_loop` is intentionally absent: it belongs to the retired step engine and no
 * longer resolves a template, so offering it would let an operator assign an override that
 * can never take effect.
 */
const STEPS: Array<{ step: PromptTemplateStep; label: string; description: string }> = [
  {
    step: 'turn_planner',
    label: 'Turn planner',
    description: 'Chooses which tools to call for a turn, and with what intent.',
  },
  {
    step: 'param_extraction',
    label: 'Parameter extraction',
    description: 'Turns a planned action into concrete tool arguments.',
  },
  {
    step: 'response_synthesis',
    label: 'Response synthesis',
    description: 'Writes the answer from tool results.',
  },
  {
    step: 'response_synthesis_direct',
    label: 'Response synthesis — direct',
    description: 'Answers without tool results, when no retrieval was needed.',
  },
  {
    step: 'response_synthesis_lightweight',
    label: 'Response synthesis — lightweight',
    description: 'Short-form answers on the reduced-cost path.',
  },
];

function templateName(template: PromptTemplate | undefined): string {
  if (!template) return 'Not configured';
  return `${template.label?.trim() || 'Untitled'} · v${template.version}`;
}

export function PromptOverridePanel({ experienceId }: { experienceId: string }) {
  const { templates, isLoading: isLoadingTemplates } = usePromptTemplates();
  const { defaults, isLoading: isLoadingDefaults } = useSystemDefaults();
  const {
    overrides,
    isLoading: isLoadingOverrides,
    setOverride,
    isSettingOverride,
    removeOverride,
    isRemovingOverride,
  } = useExperienceOverrides(experienceId);

  const isLoading = isLoadingTemplates || isLoadingDefaults || isLoadingOverrides;
  const isMutating = isSettingOverride || isRemovingOverride;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading prompt assignments…</p>;
  }

  const overrideByStep = new Map(overrides.map((o) => [o.step, o]));
  const templateById = new Map(templates.map((t) => [t.id, t]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Each step uses the system default unless this experience overrides it. Changes take
        effect on the next turn.
      </p>

      <div className="space-y-3">
        {STEPS.map(({ step, label, description }) => {
          const override = overrideByStep.get(step);
          const systemDefault = defaults[step];
          // An override row can outlive the template it points at; fall back to the id so
          // the row stays actionable rather than rendering as empty.
          const active = override
            ? templateById.get(override.templateId) ?? systemDefault
            : systemDefault;

          // Only templates for this step are assignable — the API rejects a mismatch, and
          // offering one would be a guaranteed error.
          const assignable = templates.filter((t) => t.step === step && t.status !== 'archived');

          // A step whose only template is the default it already uses has nothing to choose
          // between. Left as a live dropdown it opens onto a single entry identical to the
          // current state, which reads as a broken picker until you check another step and
          // find real alternatives there. Saying so is shorter and truer than offering a
          // choice that is not one.
          const hasAlternatives = assignable.some((t) => t.id !== systemDefault?.id);

          return (
            <div
              key={step}
              className="rounded-xl border border-border/60 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{label}</span>
                    {override ? (
                      <Badge variant="secondary">Override</Badge>
                    ) : (
                      <Badge variant="outline">System default</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{description}</p>
                </div>

                {active && (
                  <Link
                    href={`/prompt-templates/${active.id}`}
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0"
                  >
                    Edit <ExternalLink className="size-3" />
                  </Link>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Select
                  value={override?.templateId ?? ''}
                  disabled={isMutating || !hasAlternatives}
                  onValueChange={(templateId) => setOverride({ step, templateId })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue
                      placeholder={
                        assignable.length === 0
                          ? 'No templates exist for this step'
                          : hasAlternatives
                          ? `Using ${templateName(systemDefault)}`
                          : `Using ${templateName(systemDefault)} — the only one for this step`
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {assignable.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {templateName(t)}
                        {t.isSystemDefault ? ' — system default' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {override && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isMutating}
                    onClick={() => removeOverride(step)}
                    className="shrink-0"
                  >
                    <RotateCcw className="size-3.5 mr-1.5" />
                    Use default
                  </Button>
                )}
              </div>

              {override && !templateById.get(override.templateId) && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  This override points at a template that no longer exists. Reverting to the
                  default will clear it.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
