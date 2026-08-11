'use client';

/** Visualisation of the input-guardrail sub-flow and its general-terms list. */

import {
  ArrowDown, ArrowRight, ChevronDown, ChevronRight, MessageSquare, ShieldCheck, Tag,
} from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';

/**
 * Visual mini-flowchart showing the message classification routing.
 * Switches appearance based on whether domain filter is ON or OFF.
 */
export function GuardrailSubflowDiagram({ domainFilterEnabled }: { domainFilterEnabled: boolean }) {
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
export function GeneralTermsSection({ terms }: { terms: string[] }) {
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

