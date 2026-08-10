'use client';

import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { ExecutionPolicyOverrides, PipelineMode } from '../_lib/api-client';

import { BUDGET_PRESETS } from './ExperienceBadges';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AUTONOMOUS_POLICY,
  GOVERNED_POLICY,
  type ExecutionPolicy,
} from '@/features/ai-experience/execution-policy';

/**
 * What a turn is allowed to spend.
 *
 * This panel used to be titled by disposition — "Governed" or "Autonomous" — with the limits
 * beneath it presented as advanced settings. Two problems followed. Choosing a preset
 * appeared to do nothing, because the numbers it wrote were never shown next to it. And the
 * name promised governance while the only governing on the page was in Guardrails, which is
 * a different section and a different concern.
 *
 * Every axis here meters something: model calls, tool calls, seconds, prompt size. So the
 * panel says so, and reports the one figure that follows from the limits alone — how many
 * model calls a turn may make. Actual money depends on the model and the size of the results,
 * which only Analytics can know; a budget can still state its own ceiling.
 *
 * The compliance lock that used to live here moved to `GuardrailConfig.enforced`. It was the
 * one axis that metered nothing, and it belongs beside the rules it applies to.
 *
 * Only changed axes are stored. An override is a delta on the preset, so leaving a field at
 * its preset value keeps it tracking the preset if the preset ever changes, rather than
 * freezing today's number into the row.
 */

/**
 * Preset defaults, taken from the policy module itself rather than restated here.
 *
 * This was previously a hand-maintained copy, and it went stale the moment a preset changed:
 * the editor treated the preset's own behavior as an override and stored it, freezing that
 * value into the row so the experience stopped tracking the preset. execution-policy.ts has
 * no imports, so a client component can use it directly and the copy is unnecessary.
 */
const PRESET_DEFAULTS: Record<PipelineMode, ExecutionPolicy> = {
  deterministic: GOVERNED_POLICY,
  agentic: AUTONOMOUS_POLICY,
};


/**
 * Worst-case model calls for one turn, derived from the limits alone.
 *
 * A turn spends one call per planning round, one per action to extract its parameters, and
 * one to write the answer. This is the only cost figure the panel can state honestly —
 * tokens depend on prompt size and how much the tools return, which is measured per request
 * and reported in Analytics, not predicted here.
 */
function maxModelCalls(p: ExecutionPolicy): number {
  return p.maxPlanningRounds + p.maxToolCallsPerTurn + 1;
}

interface AxisProps {
  label: string;
  hint: string;
  value: number;
  /** The preset's value, shown only when the current value differs from it. */
  presetValue: number;
  min: number;
  max: number;
  onChange: (next: number | undefined) => void;
}

function NumberAxis({ label, hint, value, presetValue, min, max, onChange }: AxisProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        {value !== presetValue && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            preset: {presetValue}
          </span>
        )}
      </div>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) && n >= min ? n : undefined);
        }}
        className="rounded-xl"
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

interface Props {
  mode: PipelineMode;
  onModeChange: (next: PipelineMode) => void;
  value: ExecutionPolicyOverrides | null;
  onChange: (next: ExecutionPolicyOverrides | null) => void;
}

export function ExecutionPolicyEditor({ mode, onModeChange, value, onChange }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const defaults = PRESET_DEFAULTS[mode] ?? PRESET_DEFAULTS.deterministic;
  const overrides = value ?? {};
  const overrideCount = Object.keys(overrides).length;
  const isCustom = overrideCount > 0;
  const effective = { ...defaults, ...overrides };

  /** Write one axis, dropping it from the override when it matches the preset. */
  function setAxis<K extends keyof ExecutionPolicyOverrides>(
    key: K,
    next: ExecutionPolicyOverrides[K] | undefined,
  ) {
    const merged: ExecutionPolicyOverrides = { ...overrides };
    const presetValue = (defaults as unknown as Record<string, unknown>)[key as string];
    if (next === undefined || next === presetValue) {
      delete merged[key];
    } else {
      merged[key] = next;
    }
    onChange(Object.keys(merged).length > 0 ? merged : null);
  }

  /** Selecting a preset applies it wholesale — that is what makes the chips legible. */
  function selectPreset(next: PipelineMode) {
    onModeChange(next);
    onChange(null);
  }

  return (
    <div className="space-y-5 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(Object.entries(BUDGET_PRESETS) as Array<
            [PipelineMode, (typeof BUDGET_PRESETS)[PipelineMode]]
          >).map(([presetMode, cfg]) => {
            const Icon = cfg.icon;
            const active = mode === presetMode && !isCustom;
            return (
              <button
                key={presetMode}
                type="button"
                onClick={() => selectPreset(presetMode)}
                title={cfg.description}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  active
                    ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/20'
                    : 'border-border/60 bg-card text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                <Icon className="size-3.5" />
                {cfg.label}
              </button>
            );
          })}

          {/*
            Custom is a state, not a choice — it is reached by moving a limit, never by being
            clicked. Rendering it permanently (rather than only once overrides exist) is what
            tells an operator that tuning is available at all.
          */}
          <span
            title={
              isCustom
                ? `${overrideCount} limit${overrideCount === 1 ? '' : 's'} changed from the ${
                    BUDGET_PRESETS[mode]?.label ?? 'preset'
                  } preset`
                : 'Change any limit below to make this experience custom'
            }
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              isCustom
                ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/20'
                : 'border-dashed border-border/60 text-muted-foreground/60'
            }`}
          >
            Custom
            {isCustom && <span className="font-normal opacity-70">· {overrideCount}</span>}
          </span>
        </div>

        <div className="rounded-lg border border-border/50 bg-card px-3.5 py-3">
          <p className="text-sm">
            <span className="font-semibold tabular-nums">{maxModelCalls(effective)}</span>{' '}
            <span className="text-muted-foreground">model calls per turn, at most</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {effective.maxPlanningRounds} planning · {effective.maxToolCallsPerTurn} to fill in
            tool arguments · 1 to write the answer. Most turns use far fewer. Token cost depends
            on your model and how much the tools return — Analytics reports what was actually
            spent.
          </p>
          {isCustom && (
            <p className="text-xs text-muted-foreground mt-2">
              Based on {BUDGET_PRESETS[mode]?.label ?? 'a preset'}. Click a preset above to
              discard these changes.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border/60 pt-4">
        <NumberAxis
          label="Planning rounds"
          value={effective.maxPlanningRounds}
          presetValue={defaults.maxPlanningRounds}
          min={1}
          max={10}
          onChange={(n) => setAxis('maxPlanningRounds', n)}
          hint={
            effective.maxPlanningRounds === 1
              ? 'One plan per turn — the assistant cannot revise it.'
              : `Up to ${effective.maxPlanningRounds} attempts. It re-plans only when an attempt returns nothing usable, and each attempt is recorded in the trace.`
          }
        />

        <NumberAxis
          label="Tool calls per turn"
          value={effective.maxToolCallsPerTurn}
          presetValue={defaults.maxToolCallsPerTurn}
          min={1}
          max={50}
          onChange={(n) => setAxis('maxToolCallsPerTurn', n)}
          hint="Hard ceiling across every attempt, not per attempt."
        />

        <NumberAxis
          label="Turn timeout"
          value={Math.round(effective.maxTurnDurationMs / 1000)}
          presetValue={Math.round(defaults.maxTurnDurationMs / 1000)}
          min={5}
          max={300}
          onChange={(seconds) =>
            setAxis('maxTurnDurationMs', seconds === undefined ? undefined : seconds * 1000)
          }
          hint="Seconds before the turn gives up."
        />

        <div className="space-y-1.5">
          <Label className="text-xs">Persona instructions when planning</Label>
          <div className="flex items-center gap-2 h-9">
            <Switch
              checked={effective.includePersonaInPlanning}
              onCheckedChange={(on) => setAxis('includePersonaInPlanning', on)}
            />
            <span className="text-sm">{effective.includePersonaInPlanning ? 'On' : 'Off'}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Off by default: persona text governs voice and is used when composing the answer,
            not when choosing tools. Turn it on if your instructions also say which tools to
            use and when.
          </p>
        </div>
      </div>

      {/*
        The planner budget is the axis that costs on every single turn whether or not anything
        goes wrong, so it belongs in a budget panel — but it is a cost/quality trade rather
        than a ceiling, and folding it away keeps the headline decision to four controls.
      */}
      <div className="border-t border-border/60 pt-4">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight
            className={`size-3.5 transition-transform ${advancedOpen ? 'rotate-90' : ''}`}
          />
          Prompt size — what the planner is told about your data
        </button>

        {advancedOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <NumberAxis
              label="Schema fields shown to the planner"
              value={effective.maxPlannerFieldsPerSource}
              presetValue={defaults.maxPlannerFieldsPerSource}
              min={0}
              max={200}
              onChange={(n) => setAxis('maxPlannerFieldsPerSource', n)}
              hint={
                effective.maxPlannerFieldsPerSource === 0
                  ? 'Off — the planner works from tool descriptions alone.'
                  : 'Per data source, ranked by usefulness for planning, with the remainder noted in the prompt. Paid on every planning call; raise it when the planner misses fields it needed.'
              }
            />

            <NumberAxis
              label="Example values per field"
              value={effective.maxPlannerValuesPerField}
              presetValue={defaults.maxPlannerValuesPerField}
              min={0}
              max={50}
              onChange={(n) => setAxis('maxPlannerValuesPerField', n)}
              hint="Real values observed in the index, so a filter matches instead of near-missing."
            />
          </div>
        )}
      </div>
    </div>
  );
}
