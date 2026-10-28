// app/dashboard/_components/ExperiencesList.tsx

'use client';

/** The busiest experiences, with their activity this week and anything wrong */

import { AlertTriangle, BarChart3, Bot, Search } from 'lucide-react';
import Link from 'next/link';

import type { HomeExperience } from '../_lib/useHome';

import { Sparkline, pluralize } from '@/app/analytics/_components/viz';
import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/components/button';
import { Skeleton } from '@/shared/ui/components/skeleton';


export function ExperiencesList({ experiences, loading }: { experiences?: HomeExperience[]; loading: boolean }) {
  return (
    <section className="space-y-3" aria-labelledby="home-experiences">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="home-experiences" className="text-base font-semibold">
          Your experiences
        </h2>
        <Link href="/experiences" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
          All experiences
        </Link>
      </div>

      {loading || !experiences ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : experiences.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          No experiences yet.{' '}
          <Link href="/experiences/create" className="text-foreground underline">
            Create your first one
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y rounded-2xl border border-border/60 bg-card shadow-sm">
          {experiences.map((e) => {
            const Icon = e.type === 'ai' ? Bot : Search;
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg',
                    e.type === 'ai' ? 'bg-violet-100 dark:bg-violet-900' : 'bg-blue-100 dark:bg-blue-900',
                  )}
                  aria-label={e.type === 'ai' ? 'Chat experience' : 'Search experience'}
                >
                  <Icon className={cn('size-4', e.type === 'ai' ? 'text-violet-600 dark:text-violet-400' : 'text-blue-600 dark:text-blue-400')} />
                </span>
                {/* Name first; on narrow screens the status and issue drop to a line of their own */}
                <span className="min-w-0 flex-1 basis-40">
                  <Link href={e.href} className="block truncate font-medium hover:underline" title={e.name}>
                    {e.name}
                  </Link>
                  {(!e.active || e.issue) && (
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground sm:hidden">
                      {!e.active && 'Inactive'}
                      {e.issue && (
                        <span className="flex items-center gap-1 text-foreground">
                          <AlertTriangle className="size-3.5 text-viz-warning" aria-hidden /> {e.issue}
                        </span>
                      )}
                    </span>
                  )}
                </span>
                {!e.active && (
                  <span className="hidden rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground sm:inline">Inactive</span>
                )}
                {e.issue && (
                  <span className="hidden items-center gap-1 text-xs sm:flex">
                    <AlertTriangle className="size-3.5 text-viz-warning" aria-hidden /> {e.issue}
                  </span>
                )}
                <span className="flex shrink-0 items-center gap-2">
                  {/* The week day by day, so a falling experience stands out */}
                  {e.volume > 0 && (
                    <span className="hidden w-20 sm:block">
                      <Sparkline
                        values={e.trend}
                        label={`${e.name}: ${e.type === 'ai' ? 'conversations' : 'searches'} per day, last 7 days`}
                        height={20}
                      />
                    </span>
                  )}
                  <span className="text-right text-sm tabular-nums text-muted-foreground sm:w-36">
                    {e.volume > 0 ? pluralize(e.volume, e.type === 'ai' ? 'conversation' : 'search', e.type === 'ai' ? 'conversations' : 'searches') : 'No activity'}
                  </span>
                  <Button variant="ghost" size="icon" className="size-8" asChild>
                    <Link href={e.analyticsHref} aria-label={`Analytics for ${e.name}`} title="Analytics">
                      <BarChart3 className="size-4" />
                    </Link>
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
