'use client';

import { Lock, ShieldAlert } from 'lucide-react';

import { GuardrailRulesEditor } from './pipeline/GuardrailRulesEditor';

import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/**
 * What the assistant is not allowed to do.
 *
 * This is the section the word "governance" actually refers to, and it used to sit seventh
 * on the page behind a turn-budget panel titled "Governed". It is now above them, because
 * what an assistant must not do is a first-order decision and a turn budget is not.
 *
 * The lock is the substantive part. `GuardrailConfig.enforced` makes the configured rules run
 * whether or not a side is switched on — the one thing in the product that can promise a
 * reviewer "these checks cannot be turned off here". It began life inside the execution
 * policy, where it was invisible from the switch it overruled: the toggle read "off" while
 * the stage ran, and nothing on screen could explain why.
 *
 * The fix is not to explain the contradiction after the fact but to stop presenting it. A
 * locked side renders as locked and its switch is disabled, so there is no off position to
 * click and no surprise to apologize for.
 */

interface GuardrailSide {
  enabled?: boolean;
  rules?: unknown[];
}

interface Props {
  guardrailConfig: Record<string, unknown> | null;
  onUpdate: (payload: { guardrailConfig: Record<string, unknown> }) => Promise<void>;
}

function sideOf(config: Record<string, unknown> | null, key: string): GuardrailSide | undefined {
  return config?.[key] as GuardrailSide | undefined;
}

function GuardrailSideBlock({
  label,
  sideKey,
  side,
  enforced,
  guardrailConfig,
  onUpdate,
}: {
  label: string;
  sideKey: 'inputGuardrail' | 'outputGuardrail';
  side: GuardrailSide | undefined;
  enforced: boolean;
  guardrailConfig: Record<string, unknown> | null;
  onUpdate: Props['onUpdate'];
}) {
  const ruleCount = side?.rules?.length ?? 0;
  const enabled = !!side?.enabled;
  // Rules that do not exist cannot be enforced, so a lock over an empty list decides
  // nothing — the switch stays live there and the misconfiguration is called out instead.
  const locked = enforced && ruleCount > 0;

  async function setEnabled(next: boolean) {
    const base = (guardrailConfig ?? {}) as Record<string, unknown>;
    const current = (base[sideKey] ?? {}) as Record<string, unknown>;
    await onUpdate({ guardrailConfig: { ...base, [sideKey]: { ...current, enabled: next } } });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
          {locked && (
            <Badge variant="outline" className="gap-1 text-[10px] font-normal">
              <Lock className="size-2.5" />
              Enforced
            </Badge>
          )}
        </div>
        <Switch
          checked={locked || enabled}
          disabled={locked}
          onCheckedChange={setEnabled}
          aria-label={locked ? `${label} — enforced, cannot be switched off` : label}
        />
      </div>

      {enabled && ruleCount === 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-500">
          <ShieldAlert className="size-3.5 shrink-0 mt-0.5" />
          <span>
            <strong className="font-semibold">On, but nothing is checked.</strong> Add at least
            one rule below — a stage with no rules is skipped.
          </span>
        </p>
      )}

      <GuardrailRulesEditor
        side={sideKey}
        guardrailConfig={guardrailConfig}
        onUpdate={async (payload) => { await onUpdate(payload as { guardrailConfig: Record<string, unknown> }); }}
      />
    </div>
  );
}

export function GuardrailsSection({ guardrailConfig, onUpdate }: Props) {
  const enforced = guardrailConfig?.enforced === true;
  const input = sideOf(guardrailConfig, 'inputGuardrail');
  const output = sideOf(guardrailConfig, 'outputGuardrail');

  async function setEnforced(next: boolean) {
    const base = (guardrailConfig ?? {}) as Record<string, unknown>;
    await onUpdate({ guardrailConfig: { ...base, enforced: next } });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Lock className={`size-3.5 ${enforced ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="text-sm font-semibold">Lock these rules on</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Configured rules run on every turn whether or not a side below is switched on.
              Use this when the checks are a requirement rather than a preference — it is the
              only setting that guarantees they cannot be quietly disabled.
            </p>
          </div>
          <Switch checked={enforced} onCheckedChange={setEnforced} aria-label="Lock guardrails on" />
        </div>
      </div>

      <GuardrailSideBlock
        label="Incoming messages"
        sideKey="inputGuardrail"
        side={input}
        enforced={enforced}
        guardrailConfig={guardrailConfig}
        onUpdate={onUpdate}
      />

      <GuardrailSideBlock
        label="Outgoing replies"
        sideKey="outputGuardrail"
        side={output}
        enforced={enforced}
        guardrailConfig={guardrailConfig}
        onUpdate={onUpdate}
      />
    </div>
  );
}
