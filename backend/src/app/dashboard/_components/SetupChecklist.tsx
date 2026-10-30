// app/dashboard/_components/SetupChecklist.tsx

'use client';

/**
 * Getting started, for a new installation: the steps from nothing to a first
 * answered visitor. Each step ticks itself off as it happens; the list goes
 * away once all are done, or when someone hides it.
 */

import { CheckCircle2, Circle, X } from 'lucide-react';
import Link from 'next/link';

import { useDismissTip, type HomeChecklistStep } from '../_lib/useHome';

import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/components/button';


export const CHECKLIST_ID = 'tip:checklist';

export function SetupChecklist({ steps }: { steps: HomeChecklistStep[] }) {
  const dismiss = useDismissTip();
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);

  return (
    <section aria-labelledby="setup-checklist" className="relative rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 size-8 text-muted-foreground"
        onClick={() => dismiss.mutate(CHECKLIST_ID)}
        aria-label="Hide the getting started list"
        title="Hide this list"
      >
        <X className="size-4" />
      </Button>
      <div className="mb-4 space-y-1 pr-8">
        <h2 id="setup-checklist" className="font-semibold">
          Get started
        </h2>
        <p className="text-sm text-muted-foreground">
          {done} of {steps.length} done
        </p>
        <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-viz-good transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((s) => (
          <li key={s.id}>
            <Link
              href={s.href}
              onClick={(e) => {
                // The last step is the Ask box on this page
                if (s.href === '#home-ask') {
                  e.preventDefault();
                  document.getElementById('home-ask')?.focus();
                }
              }}
              className={cn(
                'flex h-full items-start gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors hover:bg-muted',
                s === next ? 'border-foreground/30' : 'border-border/60',
                s.done && 'text-muted-foreground',
              )}
              aria-current={s === next ? 'step' : undefined}
            >
              {s.done ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-viz-good" aria-label="Done" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="To do" />
              )}
              <span className={cn(s.done && 'line-through decoration-muted-foreground/50')}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
