'use client';

import { useState, useEffect } from 'react';
import {
  Database, Bot, Play, Sparkles, Save, Loader2,
  ShieldCheck, ShieldAlert, ChevronDown, ChevronRight,
  Lock, Settings2, ArrowDown, Tag, Ban, X, RefreshCw,
  MessageSquare, ArrowRight, FileText, Filter, Wrench, CheckCircle2, Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CollapsibleCard } from '@/shared/ui/custom/CollapsibleCard';

// ============================================================================
// TYPES
// ============================================================================

type EditableField =
  | { type: 'toggle'; currentValue: boolean }
  | { type: 'number'; currentValue: number; min: number; max: number; unit: string }
  | { type: 'select'; currentValue: string; options: { label: string; value: string }[] };

interface ConfigItem {
  label: string;
  value: string;
  editable?: EditableField & {
    /** Builds the partial update payload for updateExperience */
    buildPayload: (newValue: boolean | number | string) => Record<string, unknown>;
  };
}

interface PipelineStep {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  /** Whether the step has user-configurable settings */
  configurable: boolean;
  /** Whether the step can be conditionally skipped */
  conditional?: boolean;
  /** Current config values to display */
  config?: ConfigItem[];
  /** Custom content rendered below config items (for complex editors) */
  customContent?: React.ReactNode;
  /** Phase tag shown as a badge */
  phase: 'safety' | 'context' | 'planning' | 'execution' | 'synthesis' | 'persistence';
}

interface PipelineStepsCardProps {
  pipelineMode: string;
  personaConfig: Record<string, unknown>;
  sessionConfig: Record<string, unknown>;
  guardrailConfig?: Record<string, unknown> | null;
  onUpdate?: (payload: Record<string, unknown>) => Promise<void>;
  isUpdating?: boolean;
}

// ============================================================================
// PHASE COLORS
// ============================================================================

const PHASE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  safety:      { bg: 'bg-red-500/10',    text: 'text-red-600 dark:text-red-400',       border: 'border-red-500/20' },
  context:     { bg: 'bg-sky-500/10',     text: 'text-sky-600 dark:text-sky-400',       border: 'border-sky-500/20' },
  planning:    { bg: 'bg-violet-500/10',  text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-500/20' },
  execution:   { bg: 'bg-orange-500/10',  text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/20' },
  synthesis:   { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/20' },
  persistence: { bg: 'bg-slate-500/10',   text: 'text-slate-600 dark:text-slate-400',   border: 'border-slate-500/20' },
};

// ============================================================================
// BUILD STEPS FROM CONFIG
// ============================================================================

// ============================================================================
// GUARDRAIL RULES EDITOR
// ============================================================================

interface GuardrailRule {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  action: 'block' | 'warn' | 'redact' | 'reroute';
  enabled: boolean;
  priority: number;
}

// ============================================================================
// GUARDRAIL SUBFLOW DIAGRAM
// ============================================================================

/**
 * Visual mini-flowchart showing the message classification routing.
 * Switches appearance based on whether domain filter is ON or OFF.
 */
function GuardrailSubflowDiagram({ domainFilterEnabled }: { domainFilterEnabled: boolean }) {
  const nodeBase = 'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium';
  const arrowDown = 'flex justify-center py-1 text-muted-foreground/50';
  const outcome = 'ml-3 flex items-center gap-1.5 text-[11px]';

  return (
    <div className="mb-4 rounded-lg border border-border/50 bg-muted/20 p-4 space-y-1">
      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-3">
        Message Routing Flow
      </p>

      {/* Stage 1: Blocklist */}
      <div className="flex items-center gap-3">
        <div className={`${nodeBase} border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300`}>
          <ShieldCheck className="size-3.5" />
          Blocklist Check
        </div>
        <ArrowRight className="size-3 text-muted-foreground/40" />
        <span className={`${outcome} text-red-600 dark:text-red-400`}>
          <span className="inline-block size-1.5 rounded-full bg-red-500" />
          blocked → Static Reject
        </span>
      </div>

      <div className={arrowDown}><ArrowDown className="size-3" /></div>

      {/* Stage 2: Greeting */}
      <div className="flex items-center gap-3">
        <div className={`${nodeBase} border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300`}>
          <MessageSquare className="size-3.5" />
          Greeting Detect
        </div>
        <ArrowRight className="size-3 text-muted-foreground/40" />
        <span className={`${outcome} text-amber-600 dark:text-amber-400`}>
          <span className="inline-block size-1.5 rounded-full bg-amber-500" />
          greeting → Lightweight AI
        </span>
      </div>

      <div className={arrowDown}><ArrowDown className="size-3" /></div>

      {/* Stage 3: Domain Filter (conditional) */}
      {domainFilterEnabled ? (
        <>
          <div className="flex items-start gap-3">
            <div className={`${nodeBase} border-violet-500/30 bg-violet-500/5 text-violet-700 dark:text-violet-300`}>
              <Tag className="size-3.5" />
              Domain Filter
            </div>
            <div className="space-y-1 pt-1">
              <div className="flex items-center gap-1.5 text-[11px] text-violet-600 dark:text-violet-400">
                <span className="inline-block size-1.5 rounded-full bg-violet-500" />
                domain → Full Pipeline
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-sky-600 dark:text-sky-400">
                <span className="inline-block size-1.5 rounded-full bg-sky-500" />
                general → Lightweight AI
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="inline-block size-1.5 rounded-full bg-slate-400" />
                off-topic → Polite Decline
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <div className={`${nodeBase} border-border/50 bg-muted/30 text-muted-foreground`}>
            <Tag className="size-3.5 opacity-40" />
            <span className="opacity-50">Domain Filter</span>
            <span className="text-[10px] ml-1 opacity-40">OFF</span>
          </div>
          <ArrowRight className="size-3 text-muted-foreground/40" />
          <span className={`${outcome} text-violet-600 dark:text-violet-400`}>
            <span className="inline-block size-1.5 rounded-full bg-violet-500" />
            → Full Pipeline
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Read-only display of system-generated general/conversational cluster terms.
 * Sky-colored tags to distinguish from violet domain terms.
 */
function GeneralTermsSection({ terms }: { terms: string[] }) {
  const [show, setShow] = useState(false);

  return (
    <div className="border-t border-border/30 pt-3 space-y-2">
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {show ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <MessageSquare className="size-3 text-sky-500" />
        <span className="font-medium">{terms.length} general terms</span>
        <Badge variant="outline" className="ml-1.5 text-[9px] px-1.5 py-0 h-4 border-sky-500/30 text-sky-600 dark:text-sky-400">
          system-generated
        </Badge>
      </button>

      {show && (
        <div className="flex flex-wrap gap-1.5">
          {terms.map((term, i) => (
            <span
              key={`general-${term}-${i}`}
              className="inline-flex items-center h-6 px-2 text-xs rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20"
            >
              {term}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// GUARDRAIL RULES EDITOR
// ============================================================================

/**
 * Inline editor for guardrail rules (topic_gate + blocklist).
 * Renders inside the expanded step config area.
 *
 * Topic gate uses embedding similarity: user keywords are expanded by AI into
 * 20-30 semantic terms, embedded, and compared against each user message at runtime.
 */
function GuardrailRulesEditor({
  side,
  guardrailConfig,
  onUpdate,
}: {
  side: 'inputGuardrail' | 'outputGuardrail';
  guardrailConfig: Record<string, unknown> | null | undefined;
  onUpdate?: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const base = (guardrailConfig ?? {}) as Record<string, unknown>;
  const sideObj = (base[side] ?? { enabled: false, rules: [], onBlock: { message: 'Request blocked.' } }) as Record<string, unknown>;
  const rules = ((sideObj.rules ?? []) as GuardrailRule[]);
  const [saving, setSaving] = useState(false);

  // Find existing rules
  const topicGate = rules.find(r => r.type === 'topic_gate');
  const blocklist = rules.find(r => r.type === 'blocklist');

  // Form state
  const [domains, setDomains] = useState(
    () => ((topicGate?.config?.allowedDomains as string[]) ?? []).join(', '),
  );
  const [friendlyMsg, setFriendlyMsg] = useState(
    () => (topicGate?.config?.friendlyMessage as string) ?? '',
  );
  const [blockTerms, setBlockTerms] = useState(
    () => ((blocklist?.config?.terms as string[]) ?? []).join(', '),
  );

  // Domain filter toggle — independent from input guardrail enabled toggle
  const [domainFilterEnabled, setDomainFilterEnabled] = useState(
    () => (topicGate?.config?.domainFilterEnabled as boolean) ?? false,
  );

  // Expanded terms state — initially populated from saved config
  const savedExpandedTerms = (topicGate?.config?.expandedTerms as string[]) ?? [];
  const savedThreshold = (topicGate?.config?.threshold as number) ?? 0.30;
  const savedLastExpandedAt = (topicGate?.config?.lastExpandedAt as string) ?? '';
  const [expandedTerms, setExpandedTerms] = useState<string[]>(savedExpandedTerms);
  const [showExpandedTerms, setShowExpandedTerms] = useState(false);

  // Sync local expandedTerms when the saved config changes (e.g. after the
  // parent refetches the experience post Generate-Terms). Without this the
  // useState above only takes effect on initial mount, so the UI keeps showing
  // "Domain gating is inactive" until a hard page refresh even though the
  // server-side terms have been written.
  const savedExpandedTermsKey = savedExpandedTerms.join('');
  useEffect(() => {
    setExpandedTerms(savedExpandedTerms);
    // savedExpandedTermsKey is a stable content-hash of the array so we only
    // resync when contents actually change, not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedExpandedTermsKey]);

  if (!onUpdate) return null;

  const hasExpandedTerms = expandedTerms.length > 0;

  /** Build the full rules payload and persist. When `regenerate` is true, the backend
   *  re-runs AI expansion + embedding. Otherwise preserves existing expanded terms. */
  async function persistRules(opts: {
    regenerate?: boolean;
    overrideDomains?: string;
    overrideFriendlyMsg?: string;
    overrideBlockTerms?: string;
    overrideDomainFilter?: boolean;
    overrideExpandedTerms?: string[];
  } = {}) {
    if (!onUpdate) return;
    const regenerate = opts.regenerate ?? false;
    const currentDomains = opts.overrideDomains ?? domains;
    const currentFriendly = opts.overrideFriendlyMsg ?? friendlyMsg;
    const currentBlockTerms = opts.overrideBlockTerms ?? blockTerms;
    const currentDomainFilter = opts.overrideDomainFilter ?? domainFilterEnabled;
    const currentExpandedTerms = opts.overrideExpandedTerms ?? expandedTerms;

    setSaving(true);
    try {
      const updatedRules: GuardrailRule[] = rules.filter(
        r => r.type !== 'topic_gate' && r.type !== 'blocklist',
      );

      // Topic gate rule
      const domainList = currentDomains.split(',').map(d => d.trim()).filter(Boolean);
      if (domainList.length > 0) {
        const config: Record<string, unknown> = {
          allowedDomains: domainList,
          friendlyMessage: currentFriendly || undefined,
          domainFilterEnabled: currentDomainFilter,
        };

        if (!regenerate && currentExpandedTerms.length > 0) {
          const savedEmbeddings = (topicGate?.config?.termEmbeddings as number[][]) ?? [];
          if (savedEmbeddings.length === savedExpandedTerms.length) {
            const keptEmbeddings: number[][] = [];
            const keptTerms: string[] = [];
            for (const term of currentExpandedTerms) {
              const origIdx = savedExpandedTerms.indexOf(term);
              if (origIdx >= 0 && savedEmbeddings[origIdx]) {
                keptTerms.push(term);
                keptEmbeddings.push(savedEmbeddings[origIdx]);
              }
            }
            config.expandedTerms = keptTerms;
            config.termEmbeddings = keptEmbeddings;
            config.threshold = savedThreshold;
            config.lastExpandedAt = savedLastExpandedAt;
            const savedGeneralTerms = topicGate?.config?.generalTerms;
            const savedGeneralEmbeddings = topicGate?.config?.generalTermEmbeddings;
            const savedGeneralThreshold = topicGate?.config?.generalThreshold;
            if (savedGeneralTerms) config.generalTerms = savedGeneralTerms;
            if (savedGeneralEmbeddings) config.generalTermEmbeddings = savedGeneralEmbeddings;
            if (savedGeneralThreshold) config.generalThreshold = savedGeneralThreshold;
          }
        }

        updatedRules.push({
          id: topicGate?.id ?? 'topic-gate-1',
          name: 'Domain Scope',
          type: 'topic_gate',
          config,
          action: 'block',
          enabled: true,
          priority: topicGate?.priority ?? 0,
        });
      }

      // Blocklist rule
      const termList = currentBlockTerms.split(',').map(t => t.trim()).filter(Boolean);
      if (termList.length > 0) {
        updatedRules.push({
          id: blocklist?.id ?? 'blocklist-1',
          name: 'Blocked Terms',
          type: 'blocklist',
          config: { terms: termList },
          action: 'block',
          enabled: true,
          priority: blocklist?.priority ?? 10,
        });
      }

      const otherSide = side === 'inputGuardrail' ? 'outputGuardrail' : 'inputGuardrail';
      const currentOther = (base[otherSide] ?? { ...DEFAULT_GUARDRAIL_SIDE }) as Record<string, unknown>;
      await onUpdate({
        guardrailConfig: {
          [side]: { ...sideObj, rules: updatedRules },
          [otherSide]: currentOther,
        },
      });
    } finally {
      setSaving(false);
    }
  }

  /** Auto-save on blur — only if the value actually changed from saved state */
  function handleDomainsBlur() {
    const savedDomains = ((topicGate?.config?.allowedDomains as string[]) ?? []).join(', ');
    if (domains !== savedDomains) {
      // Domain keywords changed → need regeneration
      persistRules({ regenerate: true, overrideDomains: domains });
    }
  }

  function handleFriendlyMsgBlur() {
    const saved = (topicGate?.config?.friendlyMessage as string) ?? '';
    if (friendlyMsg !== saved) persistRules({ overrideFriendlyMsg: friendlyMsg });
  }

  function handleBlockTermsBlur() {
    const saved = ((blocklist?.config?.terms as string[]) ?? []).join(', ');
    if (blockTerms !== saved) persistRules({ overrideBlockTerms: blockTerms });
  }

  function handleDomainFilterToggle() {
    const newValue = !domainFilterEnabled;
    setDomainFilterEnabled(newValue);
    persistRules({ overrideDomainFilter: newValue });
  }

  function removeTerm(index: number) {
    const updated = expandedTerms.filter((_, i) => i !== index);
    setExpandedTerms(updated);
    persistRules({ overrideExpandedTerms: updated });
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Saving indicator */}
      {saving && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          <span>Saving…</span>
        </div>
      )}

      {/* Topic Gate */}
      <div className="border border-border/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Tag className="size-4 text-violet-500" />
          <span className="text-sm font-semibold">Domain Scope</span>
          <span className="text-xs text-muted-foreground ml-auto">embedding similarity</span>
        </div>

        {/* Domain Filter Toggle — auto-saves on click */}
        <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
          <div className="space-y-0.5">
            <span className="text-xs font-medium">Domain Filter</span>
            <p className="text-[11px] text-muted-foreground">
              {domainFilterEnabled
                ? 'Only domain-relevant messages reach the planner. General and off-topic messages get lightweight AI responses.'
                : 'All messages go through the full pipeline. Blocklist and greeting detection still apply.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDomainFilterToggle}
            disabled={saving}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
              domainFilterEnabled ? 'bg-violet-600' : 'bg-muted-foreground/30'
            }`}
          >
            <span
              className={`pointer-events-none block size-3.5 rounded-full bg-white shadow-sm transition-transform ${
                domainFilterEnabled ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block mb-1.5">
            Allowed Domains (comma-separated)
          </label>
          <input
            type="text"
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            onBlur={handleDomainsBlur}
            disabled={saving}
            placeholder="e.g. fashion, apparel, clothing, accessories"
            className="w-full h-8 text-sm rounded-md border border-border bg-background px-2.5 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Short keywords work best. Changes auto-save and regenerate terms on blur.
          </p>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block mb-1.5">
            Off-Topic Response
          </label>
          <input
            type="text"
            value={friendlyMsg}
            onChange={(e) => setFriendlyMsg(e.target.value)}
            onBlur={handleFriendlyMsgBlur}
            disabled={saving}
            placeholder="I can only help with questions about our products and services."
            className="w-full h-8 text-sm rounded-md border border-border bg-background px-2.5 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
        </div>

        {/* Expanded Terms Section */}
        {hasExpandedTerms && (
          <div className="border-t border-border/30 pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowExpandedTerms(!showExpandedTerms)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showExpandedTerms
                  ? <ChevronDown className="size-3" />
                  : <ChevronRight className="size-3" />
                }
                <Sparkles className="size-3 text-amber-500" />
                <span className="font-medium">{expandedTerms.length} expanded terms</span>
              </button>
              {savedLastExpandedAt && (
                <span className="text-[10px] text-muted-foreground ml-auto">
                  generated {new Date(savedLastExpandedAt).toLocaleDateString()}
                </span>
              )}
            </div>

            {showExpandedTerms && (
              <div className="flex flex-wrap gap-1.5">
                {expandedTerms.map((term, i) => (
                  <span
                    key={`${term}-${i}`}
                    className="inline-flex items-center gap-1 h-6 pl-2 pr-1 text-xs rounded-md bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20"
                  >
                    {term}
                    <button
                      type="button"
                      onClick={() => removeTerm(i)}
                      disabled={saving}
                      className="size-4 flex items-center justify-center rounded hover:bg-violet-500/20 transition-colors disabled:opacity-50"
                      title={`Remove "${term}"`}
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => persistRules({ regenerate: true })}
              disabled={saving}
              className="flex items-center gap-1.5 h-7 px-3 text-xs font-medium rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              {saving ? 'Generating…' : 'Regenerate terms'}
            </button>
          </div>
        )}

        {/* No embeddings yet — domain gating is inactive until generated */}
        {!hasExpandedTerms && domains.trim().length > 0 && (
          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
            <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
              <p className="font-medium">Domain gating is inactive</p>
              <p className="text-amber-600 dark:text-amber-400">
                No embeddings generated yet. Generate terms to expand your domain keywords into semantic
                terms and enable embedding-based topic filtering. Until then, all messages are allowed through.
              </p>
              <button
                type="button"
                onClick={() => persistRules({ regenerate: true })}
                disabled={saving}
                className="mt-1 flex items-center gap-1.5 h-7 px-3 text-xs font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                {saving ? 'Generating embeddings…' : 'Generate Terms'}
              </button>
            </div>
          </div>
        )}

        {/* General Cluster Terms (system-generated, read-only) */}
        {(() => {
          const generalTerms = (topicGate?.config?.generalTerms as string[]) ?? [];
          if (generalTerms.length === 0) return null;
          return (
            <GeneralTermsSection terms={generalTerms} />
          );
        })()}
      </div>

      {/* Blocklist */}
      <div className="border border-border/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Ban className="size-4 text-red-500" />
          <span className="text-sm font-semibold">Blocked Terms</span>
          <span className="text-xs text-muted-foreground ml-auto">hard-block before pipeline</span>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block mb-1.5">
            Terms (comma-separated)
          </label>
          <input
            type="text"
            value={blockTerms}
            onChange={(e) => setBlockTerms(e.target.value)}
            onBlur={handleBlockTermsBlur}
            disabled={saving}
            placeholder="e.g. competitor-name, profanity"
            className="w-full h-8 text-sm rounded-md border border-border bg-background px-2.5 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// BUILD STEPS FROM CONFIG
// ============================================================================

const TONE_OPTIONS = [
  { label: 'Professional', value: 'professional' },
  { label: 'Friendly', value: 'friendly' },
  { label: 'Casual', value: 'casual' },
  { label: 'Enthusiastic', value: 'enthusiastic' },
  { label: 'Concise', value: 'concise' },
];

/** Merge a partial change into a config object and return the update payload key. */
function sessionPayload(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { sessionConfig: { ...current, ...patch } };
}

function personaPayload(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { personaConfig: { ...current, ...patch } };
}

const DEFAULT_GUARDRAIL_SIDE = { enabled: false, rules: [], onBlock: { message: 'Your message was blocked by content policy.' } };

function guardrailPayload(
  current: Record<string, unknown> | null | undefined,
  side: 'inputGuardrail' | 'outputGuardrail',
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = (current ?? {}) as Record<string, unknown>;
  const otherSide = side === 'inputGuardrail' ? 'outputGuardrail' : 'inputGuardrail';
  // Ensure both sides always have valid defaults — Zod requires both
  const currentSide = (base[side] ?? { ...DEFAULT_GUARDRAIL_SIDE }) as Record<string, unknown>;
  const currentOther = (base[otherSide] ?? { ...DEFAULT_GUARDRAIL_SIDE }) as Record<string, unknown>;
  return {
    guardrailConfig: {
      [side]: { ...currentSide, ...patch },
      [otherSide]: currentOther,
    },
  };
}

// ============================================================================
// CONTEXT ASSEMBLY — custom content component
// ============================================================================

const ALWAYS_ON_FEATURES = [
  { label: 'Tool Resolution', detail: 'Loads schemas for all assigned tools' },
  { label: 'Persona & Tone', detail: 'Injected from experience config' },
  { label: 'Result Memory', detail: 'Resolves references like "item 2" or "that one"' },
];

function ContextAssemblyContent({
  episodicEnabled,
  editable,
  onUpdate,
  sessionConfig,
}: {
  episodicEnabled: boolean;
  editable: boolean;
  onUpdate?: (payload: Record<string, unknown>) => Promise<void>;
  sessionConfig: Record<string, unknown>;
}) {
  const [saving, setSaving] = useState(false);

  async function handleToggle(v: boolean) {
    if (!onUpdate) return;
    setSaving(true);
    try {
      await onUpdate(sessionPayload(sessionConfig, { enableUserContext: v }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Always-on features — compact inline list */}
      <div className="flex flex-wrap gap-2">
        {ALWAYS_ON_FEATURES.map((f) => (
          <div
            key={f.label}
            className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-3 py-2"
            title={f.detail}
          >
            <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-xs font-medium text-foreground">{f.label}</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">— {f.detail}</span>
          </div>
        ))}
      </div>

      {/* Episodic Memory — editable card with nested detail */}
      <div className="border border-border/50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Episodic Memory</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${episodicEnabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
              {episodicEnabled ? 'Active' : 'Off'}
            </span>
          </div>
          {editable && (
            <div className="flex items-center gap-2">
              {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
              <ToggleControl value={episodicEnabled} onToggle={handleToggle} saving={saving} />
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          {episodicEnabled
            ? 'Each turn, the user\u2019s message is embedded and matched against stored memories via semantic search. Top 3 relevant memories are injected into the AI\u2019s context.'
            : 'When enabled, the AI will recall past user preferences and interactions using semantic search. Adds an embedding call per turn.'
          }
        </p>
        {episodicEnabled && (
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-sky-500" /> Retrieval: cosine similarity</span>
            <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-sky-500" /> Top 3 per turn</span>
            <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-sky-500" /> Threshold: 0.45</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// TURN PLANNER — custom content component
// ============================================================================

function TurnPlannerContent() {
  return (
    <div className="mt-3 space-y-3">
      {/* What the planner receives */}
      <div className="border border-border/50 rounded-lg p-4 space-y-2">
        <span className="text-sm font-semibold text-foreground">Context sent to AI</span>
        <div className="flex flex-wrap gap-2">
          {[
            'User message',
            'Conversation history',
            'Session facts',
            'Tool summaries (no schemas)',
            'Result memory index',
            'Episodic memories',
          ].map((item) => (
            <span key={item} className="text-xs rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5 text-foreground/80">
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* What the planner outputs */}
      <div className="border border-border/50 rounded-lg p-4 space-y-2">
        <span className="text-sm font-semibold text-foreground">Plan output</span>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>Ordered action list (tool + intent)</span>
          <span>Dependency flags between actions</span>
          <span>Direct response / clarification routing</span>
          <span>Confidence score (0–1)</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// RESPONSE PRESETS — toggleable preset editor for D3
// ============================================================================

const ALL_PRESETS: { value: string; label: string; description: string }[] = [
  { value: 'rich_text', label: 'Rich Text', description: 'Markdown-formatted text response' },
  { value: 'single_card', label: 'Single Card', description: 'Detailed view of one result item' },
  { value: 'item_grid', label: 'Item Grid', description: 'Visual grid of multiple items with images' },
  { value: 'item_list', label: 'Item List', description: 'Compact list of results without images' },
  { value: 'comparison_table', label: 'Comparison Table', description: 'Side-by-side comparison of items' },
  { value: 'step_list', label: 'Step List', description: 'Numbered step-by-step instructions' },
  { value: 'summary_with_sources', label: 'Summary + Sources', description: 'Narrative summary with source footnotes' },
];

function ResponsePresetsEditor({
  enabledPresets,
  defaultPreset,
  editable,
  onUpdate,
  personaConfig,
}: {
  enabledPresets: string[];
  defaultPreset: string;
  editable: boolean;
  onUpdate?: (payload: Record<string, unknown>) => Promise<void>;
  personaConfig: Record<string, unknown>;
}) {
  const [saving, setSaving] = useState(false);
  // Normalize legacy 'markdown_rich' → 'rich_text' for display
  const enabledSet = new Set(enabledPresets.map(p => p === 'markdown_rich' ? 'rich_text' : p));

  async function togglePreset(preset: string) {
    if (!onUpdate || !editable) return;
    // rich_text cannot be disabled — it's the fallback
    if (preset === 'rich_text') return;

    setSaving(true);
    try {
      // Sanitize legacy 'markdown_rich' → 'rich_text'
      const sanitized = enabledPresets.map(p => p === 'markdown_rich' ? 'rich_text' : p);
      const sanitizedSet = new Set(sanitized);

      const updated = sanitizedSet.has(preset)
        ? sanitized.filter(p => p !== preset)
        : [...sanitized, preset];

      // Deduplicate (in case sanitization created duplicates)
      const deduped = [...new Set(updated)];

      // If the default was removed, reset to rich_text
      const sanitizedDefault = defaultPreset === 'markdown_rich' ? 'rich_text' : defaultPreset;
      const newDefault = deduped.includes(sanitizedDefault) ? sanitizedDefault : 'rich_text';

      const currentFormats = (personaConfig?.responseFormats ?? {}) as Record<string, unknown>;
      await onUpdate(personaPayload(personaConfig, {
        responseFormats: { ...currentFormats, enabledPresets: deduped, defaultPreset: newDefault },
      }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="border border-border/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Response Presets</span>
          {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          The pipeline selects a preset based on tool results and display configs. Only enabled presets are candidates.
          Rich Text is always available as the fallback.
        </p>
        <div className="flex flex-wrap gap-2">
          {ALL_PRESETS.map((p) => {
            const isEnabled = enabledSet.has(p.value);
            const isRichText = p.value === 'rich_text';
            return (
              <button
                key={p.value}
                type="button"
                disabled={saving || !editable || isRichText}
                onClick={() => togglePreset(p.value)}
                title={`${p.description}${isRichText ? ' (always enabled)' : ''}`}
                className={`
                  flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors
                  ${isEnabled
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-border/50 bg-muted/20 text-muted-foreground'
                  }
                  ${editable && !isRichText ? 'cursor-pointer hover:border-emerald-500/60' : ''}
                  ${isRichText ? 'cursor-default' : ''}
                  ${saving ? 'opacity-50' : ''}
                `}
              >
                <span className={`size-1.5 rounded-full ${isEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EXECUTION STEP CHAIN DIAGRAM
// ============================================================================

const SEARCH_CHAIN_STEPS = [
  { id: 'context_enrichment', label: 'Enrich', description: 'Resolve valid filter values, sanitize invalid hints', icon: FileText, color: 'text-slate-500' },
  { id: 'param_extraction', label: 'Extract', description: 'AI extracts structured params using tool schema', icon: Bot, color: 'text-violet-500' },
  { id: 'filter_validation', label: 'Validate', description: 'Backend validates filter fields and values', icon: Filter, color: 'text-blue-500' },
  { id: 'tool_execution', label: 'Execute', description: 'Run the search with validated parameters', icon: Search, color: 'text-orange-500' },
  { id: 'zero_result_retry', label: 'Retry', description: 'Progressive relaxation on zero results', icon: RefreshCw, color: 'text-amber-500' },
  { id: 'result_capture', label: 'Capture', description: 'Store results for next actions and synthesis', icon: CheckCircle2, color: 'text-green-500' },
] as const;

const DEFAULT_CHAIN_STEPS = [
  { id: 'param_extraction', label: 'Extract', description: 'AI extracts structured params using tool schema', icon: Bot, color: 'text-violet-500' },
  { id: 'tool_execution', label: 'Execute', description: 'Run the tool with validated parameters', icon: Wrench, color: 'text-orange-500' },
  { id: 'result_capture', label: 'Capture', description: 'Store results for next actions and synthesis', icon: CheckCircle2, color: 'text-green-500' },
] as const;

function ExecutionStepChainDiagram() {
  return (
    <div className="space-y-4">
      {/* Search tools chain */}
      <div>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
          Search tools <span className="font-normal">(data_source:search)</span>
        </p>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {SEARCH_CHAIN_STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.id} className="flex items-center gap-1 min-w-0">
                {i > 0 && <ArrowRight className="size-3 text-muted-foreground/40 shrink-0" />}
                <div className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1.5 min-w-0" title={step.description}>
                  <Icon className={`size-3 shrink-0 ${step.color}`} />
                  <span className="text-[11px] font-medium whitespace-nowrap">{step.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Default tools chain */}
      <div>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
          Other tools <span className="font-normal">(http, lookup, mcp, etc.)</span>
        </p>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {DEFAULT_CHAIN_STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.id} className="flex items-center gap-1 min-w-0">
                {i > 0 && <ArrowRight className="size-3 text-muted-foreground/40 shrink-0" />}
                <div className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1.5 min-w-0" title={step.description}>
                  <Icon className={`size-3 shrink-0 ${step.color}`} />
                  <span className="text-[11px] font-medium whitespace-nowrap">{step.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/60">
        Each step produces its own trace span for per-step observability.
      </p>
    </div>
  );
}

function buildSteps(props: PipelineStepsCardProps): PipelineStep[] {
  const { personaConfig, sessionConfig, guardrailConfig, onUpdate } = props;
  const inputGuardrail = guardrailConfig?.inputGuardrail as Record<string, unknown> | undefined;
  const outputGuardrail = guardrailConfig?.outputGuardrail as Record<string, unknown> | undefined;
  const responseFormats = personaConfig?.responseFormats as Record<string, unknown> | undefined;
  const editable = !!onUpdate;

  // Extract domain filter state for the subflow diagram
  const inputRules = (inputGuardrail?.rules as Array<Record<string, unknown>>) ?? [];
  const topicGateRule = inputRules.find(r => r.type === 'topic_gate');
  const domainFilterOn = (topicGateRule?.config as Record<string, unknown> | undefined)?.domainFilterEnabled === true;

  return [
    // S1: Input Guardrail
    {
      id: 's1',
      label: 'Input Guardrail',
      description: 'Evaluates the user message against content policy rules before processing. Blocks harmful or off-topic requests.',
      icon: ShieldCheck,
      iconColor: 'text-red-500',
      configurable: true,
      conditional: true,
      phase: 'safety',
      config: [
        {
          label: 'Status',
          value: inputGuardrail?.enabled ? 'Enabled' : 'Disabled',
          ...(editable && {
            editable: {
              type: 'toggle' as const,
              currentValue: !!inputGuardrail?.enabled,
              buildPayload: (v: boolean | number | string) =>
                guardrailPayload(guardrailConfig, 'inputGuardrail', { enabled: v }),
            },
          }),
        },
        ...(inputGuardrail?.enabled
          ? [{ label: 'Rules', value: `${(inputGuardrail?.rules as unknown[])?.length ?? 0} active` }]
          : []),
      ],
      ...(inputGuardrail?.enabled && {
        customContent: (
          <>
            <GuardrailSubflowDiagram domainFilterEnabled={domainFilterOn} />
            {editable && (
              <GuardrailRulesEditor
                side="inputGuardrail"
                guardrailConfig={guardrailConfig}
                onUpdate={onUpdate}
              />
            )}
          </>
        ),
      }),
    },

    // S2a: Session Load
    {
      id: 's2a',
      label: 'Session Load',
      description: 'Loads an existing session from the database or creates a new one. Retrieves conversation history and session state.',
      icon: Database,
      iconColor: 'text-sky-500',
      configurable: true,
      phase: 'context',
      config: [
        {
          label: 'Session TTL',
          value: `${sessionConfig?.sessionTtlMinutes ?? 1440} min`,
          ...(editable && {
            editable: {
              type: 'number' as const,
              currentValue: (sessionConfig?.sessionTtlMinutes as number) ?? 1440,
              min: 1, max: 43200, unit: 'min',
              buildPayload: (v: boolean | number | string) =>
                sessionPayload(sessionConfig, { sessionTtlMinutes: v }),
            },
          }),
        },
        {
          label: 'Context Window',
          value: `${sessionConfig?.maxContextMessages ?? 20} messages`,
          ...(editable && {
            editable: {
              type: 'number' as const,
              currentValue: (sessionConfig?.maxContextMessages as number) ?? 20,
              min: 1, max: 100, unit: 'messages',
              buildPayload: (v: boolean | number | string) =>
                sessionPayload(sessionConfig, { maxContextMessages: v }),
            },
          }),
        },
        {
          label: 'Summary Threshold',
          value: `${sessionConfig?.summaryThreshold ?? 30} messages`,
          ...(editable && {
            editable: {
              type: 'number' as const,
              currentValue: (sessionConfig?.summaryThreshold as number) ?? 30,
              min: 5, max: 100, unit: 'messages',
              buildPayload: (v: boolean | number | string) =>
                sessionPayload(sessionConfig, { summaryThreshold: v, enableConversationSummary: true }),
            },
          }),
        },
      ],
    },

    // S2b: Context Assembly
    {
      id: 's2b',
      label: 'Context Assembly',
      description: 'Builds the full context the AI sees for this turn. Resolves available tools with their schemas, loads persona instructions, and optionally retrieves episodic memories via semantic search.',
      icon: Database,
      iconColor: 'text-sky-500',
      configurable: true,
      phase: 'context',
      config: [],
      customContent: (
        <ContextAssemblyContent
          episodicEnabled={!!(sessionConfig?.enableUserContext ?? false)}
          editable={editable}
          onUpdate={onUpdate}
          sessionConfig={sessionConfig}
        />
      ),
    },

    // D1: Turn Planner
    {
      id: 'd1',
      label: 'Turn Planner',
      description: 'Single AI call that decides the action plan for this turn — which tools to call, in what order, and whether the user needs a direct response or clarification instead.',
      icon: Bot,
      iconColor: 'text-violet-500',
      configurable: true,
      phase: 'planning',
      config: [
        { label: 'AI Provider & Model', value: personaConfig?.model as string ?? 'System Default (set in experience config)' },
        { label: 'Temperature', value: '0.1 — low for consistent planning' },
      ],
      customContent: (
        <TurnPlannerContent />
      ),
    },

    // D2: Execution Loop
    {
      id: 'd2',
      label: 'Execution Loop',
      description: 'Iterates through planned actions sequentially. Each action flows through a tool-type-aware step chain with per-step observability.',
      icon: Play,
      iconColor: 'text-orange-500',
      configurable: true,
      phase: 'execution',
      config: [
        { label: 'Batch Size', value: '3 actions/turn' },
        { label: 'Max Retries', value: '1 per action' },
      ],
      customContent: (
        <ExecutionStepChainDiagram />
      ),
    },

    // D3: Response Synthesis
    {
      id: 'd3',
      label: 'Response Synthesis',
      description: 'Selects a UI preset based on results, then generates the final AI response incorporating tool results and persona voice.',
      icon: Sparkles,
      iconColor: 'text-emerald-500',
      configurable: true,
      phase: 'synthesis',
      config: [
        {
          label: 'Tone',
          value: String(personaConfig?.tone ?? 'professional').replace(/^\w/, c => c.toUpperCase()),
          ...(editable && {
            editable: {
              type: 'select' as const,
              currentValue: String(personaConfig?.tone ?? 'professional'),
              options: TONE_OPTIONS,
              buildPayload: (v: boolean | number | string) =>
                personaPayload(personaConfig, { tone: v }),
            },
          }),
        },
        { label: 'Max Response', value: responseFormats?.maxResponseLength ? `${responseFormats.maxResponseLength} tokens` : 'Default' },
        { label: 'Citations', value: (responseFormats?.enableCitations ?? true) ? String(responseFormats?.citationStyle ?? 'inline') : 'Disabled' },
      ],
      customContent: (
        <ResponsePresetsEditor
          enabledPresets={(responseFormats?.enabledPresets as string[]) ?? ['rich_text']}
          defaultPreset={(responseFormats?.defaultPreset as string) ?? 'rich_text'}
          editable={editable}
          onUpdate={onUpdate}
          personaConfig={personaConfig}
        />
      ),
    },

    // S3: Output Guardrail
    {
      id: 's3',
      label: 'Output Guardrail',
      description: 'Evaluates the AI response against output policy rules before sending to the user. Can redact or block inappropriate responses.',
      icon: ShieldAlert,
      iconColor: 'text-red-500',
      configurable: true,
      conditional: true,
      phase: 'safety',
      config: [
        {
          label: 'Status',
          value: outputGuardrail?.enabled ? 'Enabled' : 'Disabled',
          ...(editable && {
            editable: {
              type: 'toggle' as const,
              currentValue: !!outputGuardrail?.enabled,
              buildPayload: (v: boolean | number | string) =>
                guardrailPayload(guardrailConfig, 'outputGuardrail', { enabled: v }),
            },
          }),
        },
        ...(outputGuardrail?.enabled
          ? [{ label: 'Rules', value: `${(outputGuardrail?.rules as unknown[])?.length ?? 0} active` }]
          : []),
      ],
      ...(editable && outputGuardrail?.enabled && {
        customContent: (
          <GuardrailRulesEditor
            side="outputGuardrail"
            guardrailConfig={guardrailConfig}
            onUpdate={onUpdate}
          />
        ),
      }),
    },

    // D4: Persistence
    {
      id: 'd4',
      label: 'Persistence',
      description: 'Saves the user message, AI response, tool results, and updated session state to the database.',
      icon: Save,
      iconColor: 'text-slate-500',
      configurable: false,
      phase: 'persistence',
    },

    // Post-turn: Memory & Summarization (fire-and-forget)
    {
      id: 'post',
      label: 'Post-Turn Tasks',
      description: 'Async background tasks: episodic memory extraction (learns user preferences) and conversation summarization (when threshold reached).',
      icon: Database,
      iconColor: 'text-slate-400',
      configurable: true,
      conditional: true,
      phase: 'persistence',
      config: [
        { label: 'Memory Extraction', value: 'On (when user identified)' },
        { label: 'Conversation Summary', value: 'Always on (triggers at threshold)' },
      ],
    },
  ];
}

// ============================================================================
// STEP ROW COMPONENT
// ============================================================================

// ============================================================================
// INLINE EDIT CONTROLS
// ============================================================================

function ToggleControl({
  value,
  onToggle,
  saving,
}: {
  value: boolean;
  onToggle: (v: boolean) => void;
  saving: boolean;
}) {
  return (
    <button
      type="button"
      disabled={saving}
      onClick={() => onToggle(!value)}
      className={`
        relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full
        border-2 border-transparent transition-colors
        ${value ? 'bg-emerald-500' : 'bg-muted-foreground/30'}
        ${saving ? 'opacity-50 cursor-wait' : ''}
      `}
    >
      <span
        className={`
          pointer-events-none block size-3.5 rounded-full bg-white shadow-sm transition-transform
          ${value ? 'translate-x-4' : 'translate-x-0.5'}
        `}
      />
    </button>
  );
}

function NumberControl({
  value,
  min,
  max,
  unit,
  onCommit,
  saving,
}: {
  value: number;
  min: number;
  max: number;
  unit: string;
  onCommit: (v: number) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  function handleCommit() {
    const parsed = parseInt(draft, 10);
    if (!isNaN(parsed) && parsed >= min && parsed <= max && parsed !== value) {
      onCommit(parsed);
    } else {
      setDraft(String(value));
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        className="text-sm font-semibold mt-0.5 hover:text-primary transition-colors cursor-pointer"
        title="Click to edit"
      >
        {value} {unit}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleCommit(); if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); } }}
        onBlur={handleCommit}
        autoFocus
        disabled={saving}
        className="w-20 h-7 text-sm font-semibold rounded-md border border-border bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <span className="text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

function SelectControl({
  value,
  options,
  onChange,
  saving,
}: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  saving: boolean;
}) {
  return (
    <select
      value={value}
      disabled={saving}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 text-sm font-semibold rounded-md border border-border bg-background px-2 mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// ============================================================================
// CONFIG ITEM RENDERER
// ============================================================================

function ConfigItemDisplay({
  item,
  onUpdate,
}: {
  item: ConfigItem;
  onUpdate?: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  async function handleChange(newValue: boolean | number | string) {
    if (!item.editable || !onUpdate) return;
    setSaving(true);
    try {
      await onUpdate(item.editable.buildPayload(newValue));
    } finally {
      setSaving(false);
    }
  }

  if (item.editable) {
    return (
      <div className="bg-muted/30 rounded-lg px-3 py-2.5">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{item.label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {item.editable.type === 'toggle' && (
            <ToggleControl value={item.editable.currentValue} onToggle={handleChange} saving={saving} />
          )}
          {item.editable.type === 'number' && (
            <NumberControl
              value={item.editable.currentValue}
              min={item.editable.min}
              max={item.editable.max}
              unit={item.editable.unit}
              onCommit={handleChange}
              saving={saving}
            />
          )}
          {item.editable.type === 'select' && (
            <SelectControl
              value={item.editable.currentValue}
              options={item.editable.options}
              onChange={handleChange}
              saving={saving}
            />
          )}
          {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </div>
      </div>
    );
  }

  // Read-only: clean informational style — visible but clearly not interactive
  return (
    <div className="flex items-start gap-2 px-3 py-2">
      <span className="size-1.5 rounded-full bg-foreground/30 mt-2 shrink-0" />
      <div>
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{item.label}</p>
        <p className="text-sm text-foreground/80 mt-0.5">{item.value}</p>
      </div>
    </div>
  );
}

// ============================================================================
// STEP ROW COMPONENT
// ============================================================================

function StepRow({
  step,
  isLast,
  onUpdate,
}: {
  step: PipelineStep;
  isLast: boolean;
  onUpdate?: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasConfig = step.config && step.config.length > 0;
  const hasExpandable = hasConfig || !!step.customContent;
  const phaseStyle = PHASE_STYLES[step.phase];
  const Icon = step.icon;

  return (
    <div className="relative">
      {/* Connector line */}
      {!isLast && (
        <div className="absolute left-[19px] top-[40px] bottom-0 w-px bg-border/60" />
      )}

      <div className="relative flex gap-3 rounded-xl px-2 py-1.5 -mx-2 transition-colors group/step">
        {/* Step icon */}
        <div
          className={`relative z-10 flex size-10 shrink-0 items-center justify-center rounded-xl bg-background border border-border/60 shadow-sm transition-shadow ${hasExpandable ? 'cursor-pointer' : ''}`}
          onClick={() => hasExpandable && setExpanded(!expanded)}
        >
          <Icon className={`size-4.5 ${step.iconColor}`} />
        </div>

        {/* Step content */}
        <div className="flex-1 min-w-0 pb-6">
          {/* Header row — clickable to expand/collapse */}
          <div
            className={`flex items-center gap-2 w-full text-left group rounded-lg px-1.5 py-1 -mx-1.5 transition-colors ${hasExpandable ? 'cursor-pointer hover:bg-muted/50' : ''}`}
            onClick={() => hasExpandable && setExpanded(!expanded)}
            role={hasExpandable ? 'button' : undefined}
            tabIndex={hasExpandable ? 0 : undefined}
            onKeyDown={hasExpandable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } } : undefined}
          >
            <span className="text-[15px] font-semibold text-foreground">{step.label}</span>

            {/* Phase badge */}
            <Badge
              variant="outline"
              className={`rounded-md text-[11px] px-1.5 py-0 border ${phaseStyle.bg} ${phaseStyle.text} ${phaseStyle.border}`}
            >
              {step.phase}
            </Badge>

            {/* Conditional badge */}
            {step.conditional && (
              <Badge variant="outline" className="rounded-md text-[11px] px-1.5 py-0 border-dashed text-muted-foreground">
                conditional
              </Badge>
            )}

            {/* Lock icon for non-configurable */}
            {!step.configurable && (
              <Lock className="size-3.5 text-muted-foreground/50" />
            )}

            {/* Expand chevron */}
            {hasExpandable && (
              <span className="ml-auto text-muted-foreground group-hover:text-foreground transition-colors">
                {expanded
                  ? <ChevronDown className="size-4" />
                  : <ChevronRight className="size-4" />
                }
              </span>
            )}
          </div>

          {/* Description — also clickable to expand */}
          <p
            className={`text-sm text-muted-foreground mt-1.5 leading-relaxed pr-4 ${hasExpandable ? 'cursor-pointer' : ''}`}
            onClick={() => hasExpandable && setExpanded(!expanded)}
          >
            {step.description}
          </p>

          {/* Expanded config — clicks here do NOT toggle expand */}
          {expanded && (hasConfig || step.customContent) && (
            <div onClick={(e) => e.stopPropagation()}>
              {hasConfig && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {step.config!.map((item) => (
                    <ConfigItemDisplay key={item.label} item={item} onUpdate={onUpdate} />
                  ))}
                </div>
              )}
              {step.customContent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PipelineStepsCard(props: PipelineStepsCardProps) {
  const steps = buildSteps(props);
  const isDeterministicV2 = props.pipelineMode === 'deterministic';

  return (
    <CollapsibleCard
      icon={<Settings2 className="size-4 text-blue-500" />}
      title="Pipeline Configuration"
      description={
        isDeterministicV2
          ? 'Deterministic pipeline — every turn follows this fixed sequence. Click a step to view and edit its configuration.'
          : 'Agentic pipeline — the AI autonomously decides the flow. Steps shown below reflect the standard path.'
      }
      headerExtras={
        <Badge variant="outline" className="rounded-lg text-xs font-mono shrink-0">
          {steps.length} steps
        </Badge>
      }
    >
      {/* Flow indicator */}
      <div className="flex items-center gap-2 mb-5 px-1">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">User Message</span>
        <ArrowDown className="size-3.5 text-muted-foreground" />
      </div>

      {/* Pipeline steps */}
      <div>
        {steps.map((step, i) => (
          <StepRow key={step.id} step={step} isLast={i === steps.length - 1} onUpdate={props.onUpdate} />
        ))}
      </div>

      {/* Flow indicator */}
      <div className="flex items-center gap-2 mt-2 px-1">
        <ArrowDown className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Response Delivered</span>
      </div>
    </CollapsibleCard>
  );
}
