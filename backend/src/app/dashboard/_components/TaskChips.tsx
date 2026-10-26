// app/dashboard/_components/TaskChips.tsx

'use client';

/** What is broken or waiting, as chips with a count; each opens where it gets fixed */

import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

import type { HomeTask } from '../_lib/useHome';

import { cn } from '@/lib/utils';
import { Skeleton } from '@/shared/ui/components/skeleton';


export function TaskChips({ tasks, loading }: { tasks?: HomeTask[]; loading: boolean }) {
  if (loading || !tasks) {
    return (
      <div className="flex justify-center gap-2">
        {[140, 180, 120].map((w) => (
          <Skeleton key={w} className="h-9 rounded-full" style={{ width: w }} />
        ))}
      </div>
    );
  }
  if (tasks.length === 0) {
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 text-viz-good" aria-hidden /> Nothing needs you right now
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap justify-center gap-2" aria-label="Needs you">
      {tasks.map((t) => (
        <li key={t.id}>
          <Link
            href={t.href}
            className="flex items-center gap-2 rounded-full border border-border/70 bg-card py-1.5 pl-3.5 pr-1.5 text-sm shadow-sm transition-colors hover:bg-muted"
          >
            {t.label}
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                t.tone === 'critical'
                  ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
              )}
            >
              {t.count > 50 ? '50+' : t.count}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
