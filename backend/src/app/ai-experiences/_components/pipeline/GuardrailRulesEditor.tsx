'use client';

/**
 * Editor for one side of the guardrail configuration (input or output).
 *
 * Saves immediately per change rather than as part of a form, because a rule list is a
 * relational edit and batching it behind a page-level Save would leave the list showing
 * state the server does not have.
 */

import {
  Ban, ChevronDown, ChevronRight, Loader2, RefreshCw,
  ShieldAlert, Sparkles, Tag, X,
} from 'lucide-react';
import { useEffect, useState } from 'react';


import { GeneralTermsSection } from './GuardrailDiagram';
import { DEFAULT_GUARDRAIL_SIDE } from './pipeline-payloads';
import type { GuardrailRule } from './pipeline.types';

/**
 * Inline editor for guardrail rules (topic_gate + blocklist).
 * Renders inside the expanded step config area.
 *
 * Topic gate uses embedding similarity: user keywords are expanded by AI into
 * 20-30 semantic terms, embedded, and compared against each user message at runtime.
 */
export function GuardrailRulesEditor({
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
  // The single number that decides whether a message is on-topic. It has always been stored
  // and carried through on save, and never rendered — so the one control that governs
  // whether every incoming question is answered or refused could only be changed by hand in
  // SQL. Tuning it is the first thing anyone does when the gate is too strict or too loose.
  const [threshold, setThreshold] = useState(savedThreshold);
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
  /** Domains as they would be persisted right now — used to describe the empty state. */
  const currentDomainList = domains.split(',').map((d) => d.trim()).filter(Boolean);

  /** Build the full rules payload and persist. When `regenerate` is true, the backend
   *  re-runs AI expansion + embedding. Otherwise preserves existing expanded terms. */
  async function persistRules(opts: {
    regenerate?: boolean;
    overrideDomains?: string;
    overrideFriendlyMsg?: string;
    overrideBlockTerms?: string;
    overrideDomainFilter?: boolean;
    overrideExpandedTerms?: string[];
    overrideThreshold?: number;
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
            config.threshold = opts.overrideThreshold ?? threshold;
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

  function handleThresholdBlur() {
    // Clamp rather than reject: a value outside the similarity range cannot match anything,
    // and silently discarding the edit would look like the field does not save.
    const clamped = Math.min(0.9, Math.max(0.05, Number(threshold)));
    if (!Number.isFinite(clamped)) { setThreshold(savedThreshold); return; }
    setThreshold(clamped);
    if (clamped !== savedThreshold) persistRules({ overrideThreshold: clamped });
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

        {/*
          Only shown while the filter is on, because off it decides nothing. The number is
          a cosine-similarity floor: a message scoring below it is treated as off-topic, so
          raising it narrows what the assistant will answer.
        */}
        {domainFilterEnabled && (
          <div>
            <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block mb-1.5">
              Match Threshold
            </label>
            <input
              type="number"
              min={0.05}
              max={0.9}
              step={0.01}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              onBlur={handleThresholdBlur}
              disabled={saving}
              className="w-28 h-8 text-sm rounded-md border border-border bg-background px-2.5 tabular-nums focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              How close a message must be to your domain terms to count as on-topic. Higher is
              stricter — raise it if off-topic questions get through, lower it if real ones are
              refused. Each turn records the score it measured, under Analytics → Traces.
            </p>
          </div>
        )}

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
          {/*
            Clearing this field is a legitimate choice, so it is not blocked — but it deletes
            the rule rather than emptying it, and a rule list that quietly loses an entry is
            how an experience ends up reporting a guardrail it no longer enforces. Say what
            the empty state means at the moment it is created.
          */}
          {blockTerms.trim() === '' && (
            <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1">
              Empty — no blocklist rule will run on this side.
              {currentDomainList.length === 0 && ' The topic gate is empty too, so nothing is checked here at all.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

