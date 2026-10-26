// app/analytics/_components/shell/AnalyticsShell.tsx

'use client';

/**
 * The analytics workspace: one header with the filters every section shares
 * (experience and period), the row of sections, and the Ask panel. Sections
 * render only their content. The full chat page keeps its own layout.
 */

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { BarChart3, RefreshCw, Sparkles } from 'lucide-react';

import { useAnalyticsContext } from '../../_lib/AnalyticsContext';
import { useAskPanel } from '../../_lib/AskPanelContext';
import { sectionForPath } from '../../_lib/sections';
import { ExperienceSelector } from '../ExperienceSelector';
import { PeriodPicker } from '../PeriodPicker';
import { AskPanel } from './AskPanel';
import { SectionNav } from './SectionNav';
import { formatTimeAgo } from '../viz';

import { Button } from '@/shared/ui/components/button';
import { cn } from '@/lib/utils';

/**
 * When the section's data last arrived. Live sections refetch every minute on
 * their own; this says so, next to the button that refreshes now.
 */
function LastUpdated({ refreshing }: { refreshing: boolean }) {
  const queryClient = useQueryClient();
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const read = () => {
      const times = cache
        .getAll()
        .filter((q) => q.getObserversCount() > 0 && ['analytics', 'telemetry'].includes(String(q.queryKey[0])))
        .map((q) => q.state.dataUpdatedAt)
        .filter((t) => t > 0);
      setUpdatedAt(times.length ? Math.max(...times) : null);
    };
    read();
    const unsubscribe = cache.subscribe(read);
    // "1 min ago" moves on even when nothing refetches
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [queryClient]);

  if (!updatedAt) return null;
  return (
    <span className="hidden text-xs text-muted-foreground sm:inline" aria-live="polite">
      {refreshing ? 'Updating…' : `Updated ${formatTimeAgo(new Date(updatedAt))}`}
    </span>
  );
}

export function AnalyticsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { experienceType } = useAnalyticsContext();
  const askPanel = useAskPanel();
  const refreshing = useIsFetching({ queryKey: ['analytics'] }) + useIsFetching({ queryKey: ['telemetry'] }) > 0;

  // The full chat page is the Ask panel's history and has its own layout
  if (pathname.startsWith('/analytics/chat')) return <>{children}</>;

  const section = sectionForPath(pathname);
  const isSearchExperience = experienceType === 'search';
  // The Overview has the conversation inline, so it needs no drawer
  const showAskDrawer = section.href !== '/analytics/overview';

  return (
    <div className="flex min-w-0 gap-6">
      {/* A size container: grids inside follow the width left beside the Ask drawer */}
      <div className="@container min-w-0 flex-1 space-y-6 p-6 lg:p-8">
        {/* Title and filters wrap onto two rows when the drawer leaves too little width for one */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-[16rem] flex-1 items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
              <BarChart3 className="size-6 text-blue-500" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Analytics</p>
              <h1 className="text-2xl font-semibold tracking-tight">{section.label}</h1>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
              <ExperienceSelector />
              <PeriodPicker />
              <LastUpdated refreshing={refreshing} />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ['analytics'] });
                  queryClient.invalidateQueries({ queryKey: ['telemetry'] });
                }}
                disabled={refreshing}
                className="size-9 rounded-xl"
                aria-label="Refresh analytics"
              >
                <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
              </Button>
              {showAskDrawer && (
                <Button
                  variant={askPanel.isOpen ? 'secondary' : 'default'}
                  className="h-9 gap-2 rounded-xl"
                  onClick={askPanel.toggle}
                  aria-pressed={askPanel.isOpen}
                >
                  <Sparkles className="size-4" /> Ask
                </Button>
              )}
          </div>
        </header>

        <SectionNav className="-mt-2" />

        {section.chatOnly && isSearchExperience ? (
          <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            {section.label} covers chat experiences. Choose a chat experience, or All experiences, to see it.
          </p>
        ) : (
          children
        )}
      </div>

      {showAskDrawer && <AskPanel section={section} />}
    </div>
  );
}
