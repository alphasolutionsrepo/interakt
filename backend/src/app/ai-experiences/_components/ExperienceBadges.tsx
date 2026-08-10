'use client';

import { Gauge, Lock, Zap } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

/**
 * The two things worth knowing about an experience at a glance.
 *
 * There used to be one badge, labelled Governed or Autonomous, and it carried a decision that
 * has since been split in two. Enforcement — whether the guardrails can be switched off — moved
 * to the guardrail config, and what remains of the preset is a spend ceiling. They are
 * independent now: an experience can be Thorough and locked, or Standard and not.
 *
 * So both are shown, but not everywhere and not always.
 *
 * A badge that is always present stops being read. Measurement backs that up for the budget in
 * particular: across eight paired turns the presets produced identical behavior seven times,
 * and the eighth spent three times the tokens to reach the same answer. A list of fifty rows
 * all reading "Standard" carries no information, so on a list only the *notable* state shows —
 * a budget that is not the default, or a lock that is on. A stock experience shows nothing,
 * which is the honest amount to say about it.
 *
 * On a detail or edit header there is one experience and room to describe it, so both render.
 */

/**
 * Display config for the budget presets, keyed by the stored `pipelineMode`.
 *
 * The keys remain `deterministic` / `agentic` because they are the API contract. The labels do
 * not: "Governed" described a chat engine that no longer exists, and then briefly described a
 * token budget, which is not governance and collided with the section that is. Naming these for
 * effort keeps the word available for the guardrail lock, which earns it.
 *
 * This is the single source for those labels — the policy editor renders from it too, so the
 * chip on a list row and the preset chip in the editor cannot drift apart.
 */
export const BUDGET_PRESETS = {
  deterministic: {
    label: 'Standard',
    icon: Gauge,
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    iconClass: 'text-blue-500',
    iconBg: 'bg-blue-500/10',
    description: 'Answers from a single attempt and says what it could not match. Cheapest and most predictable.',
  },
  agentic: {
    label: 'Thorough',
    icon: Zap,
    badgeClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
    iconClass: 'text-violet-500',
    iconBg: 'bg-violet-500/10',
    description: 'Tries up to two more approaches before answering. Costs more per turn; every attempt is recorded.',
  },
} as const;

export type BudgetPresetKey = keyof typeof BUDGET_PRESETS;

/** The preset a stock experience starts on — the one worth staying quiet about in a list. */
const DEFAULT_PRESET: BudgetPresetKey = 'deterministic';

/**
 * Whether the lock actually enforces anything.
 *
 * `enforced` on its own is a declaration, not protection: rules that do not exist cannot run,
 * and the runtime skips an empty stage regardless of the flag. Badging that state "Locked"
 * would advertise a guarantee nothing is behind — the seeded Help Assistant carries the flag
 * with no rules at all, because it is deliberately unguarded.
 *
 * So the badge tracks effective enforcement, matching `guardrailDecision` and the Enforced
 * markers in the Guardrails section. An operator who locks an empty side is told about it
 * there, where they can act on it, rather than reassured about it in a list.
 */
function isLocked(guardrailConfig: Record<string, unknown> | null | undefined): boolean {
  const cfg = guardrailConfig as
    | { enforced?: boolean; inputGuardrail?: { rules?: unknown[] }; outputGuardrail?: { rules?: unknown[] } }
    | null
    | undefined;
  if (cfg?.enforced !== true) return false;
  const ruleCount =
    (cfg.inputGuardrail?.rules?.length ?? 0) + (cfg.outputGuardrail?.rules?.length ?? 0);
  return ruleCount > 0;
}

function hasCustomLimits(executionPolicy: object | null | undefined): boolean {
  return !!executionPolicy && Object.keys(executionPolicy).length > 0;
}

export function BudgetChip({
  mode,
  hasCustomPolicy = false,
}: {
  mode: string;
  hasCustomPolicy?: boolean;
}) {
  const config = BUDGET_PRESETS[mode as BudgetPresetKey];
  if (!config) return <Badge variant="outline" className="rounded-lg">{mode}</Badge>;
  const Icon = config.icon;
  return (
    <Badge
      className={`${config.badgeClass} rounded-lg px-2.5 py-1 text-xs font-semibold`}
      title={config.description}
    >
      <Icon className="mr-1.5 size-3.5" />
      {config.label}
      {hasCustomPolicy && <span className="ml-1 font-normal opacity-70">· Custom</span>}
    </Badge>
  );
}

/**
 * Shown only when guardrails are enforced.
 *
 * There is no "Unlocked" counterpart on purpose. Absence of a lock is the ordinary case, and a
 * badge announcing the ordinary case is noise; the badge means "someone decided these checks
 * cannot be turned off here", which is worth interrupting for.
 */
export function GuardrailLockChip() {
  return (
    <Badge
      className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 rounded-lg px-2.5 py-1 text-xs font-semibold"
      title="Guardrails are enforced on this experience — the configured rules run whether or not a side is switched on"
    >
      <Lock className="mr-1.5 size-3.5" />
      Locked
    </Badge>
  );
}

interface Props {
  mode: string;
  /** Any stored override object — only its key count matters here. */
  executionPolicy?: object | null;
  guardrailConfig?: Record<string, unknown> | null;
  /**
   * `full` — a detail or edit header, where there is one experience and room to describe it.
   * `notable` — a list, where only a non-default budget or an active lock is worth the space.
   */
  variant?: 'full' | 'notable';
}

export function ExperienceBadges({
  mode,
  executionPolicy,
  guardrailConfig,
  variant = 'full',
}: Props) {
  const locked = isLocked(guardrailConfig);
  const custom = hasCustomLimits(executionPolicy);
  const showBudget = variant === 'full' || mode !== DEFAULT_PRESET || custom;

  if (!showBudget && !locked) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {showBudget && <BudgetChip mode={mode} hasCustomPolicy={custom} />}
      {locked && <GuardrailLockChip />}
    </span>
  );
}
