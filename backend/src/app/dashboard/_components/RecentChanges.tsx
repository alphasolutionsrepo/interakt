// app/dashboard/_components/RecentChanges.tsx

'use client';

/** What changed lately: experiences and indexes edited, content indexed, background jobs run */

import { Clock, Layers, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import Link from 'next/link';

import type { HomeChange } from '../_lib/useHome';

import { formatTimeAgo } from '@/app/analytics/_components/viz';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/shared/ui/components/skeleton';


const ICON = { experience: Sparkles, index: Layers, reindex: RefreshCw, job: Clock } as const;

export function RecentChanges({ changes, loading }: { changes?: HomeChange[]; loading: boolean }) {
  return (
    <section className="space-y-3" aria-labelledby="home-recent">
      <h2 id="home-recent" className="text-base font-semibold">
        Recently changed
      </h2>
      {loading || !changes ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : changes.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing changed in the last 14 days.
        </p>
      ) : (
        <ul className="divide-y rounded-2xl border border-border/60 bg-card shadow-sm">
          {changes.map((c) => {
            const Icon = c.failed ? XCircle : ICON[c.kind];
            return (
              <li key={c.id}>
                <Link href={c.href} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50">
                  <Icon className={cn('mt-0.5 size-4 shrink-0', c.failed ? 'text-viz-critical' : 'text-muted-foreground')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium" title={c.label}>
                      {c.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">{c.detail}</span>
                  </span>
                  <time dateTime={c.at} className="shrink-0 text-xs text-muted-foreground" title={new Date(c.at).toLocaleString()}>
                    {formatTimeAgo(c.at)}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
