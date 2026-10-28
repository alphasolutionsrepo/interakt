// app/dashboard/page.tsx

'use client';

/**
 * Home: how the experiences are doing this week, a prompt to ask about it, what
 * needs someone now, and short stories about the data. One request feeds it
 * (/api/dashboard/home, cached on the server); the greeting and the prompt
 * render straight away and each block fills in on its own.
 */

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';


import { AskBox } from './_components/AskBox';
import { ExperiencesList } from './_components/ExperiencesList';
import { HomeCards } from './_components/HomeCards';
import { MetricsStrip } from './_components/MetricsStrip';
import { RecentChanges } from './_components/RecentChanges';
import { SetupChecklist } from './_components/SetupChecklist';
import { TaskChips } from './_components/TaskChips';
import { useHome } from './_lib/useHome';

import { AskPanel } from '@/app/analytics/_components/shell/AskPanel';
import { AnalyticsProvider } from '@/app/analytics/_lib/AnalyticsContext';
import { AskPanelProvider } from '@/app/analytics/_lib/AskPanelContext';
import type { Period } from '@/app/analytics/_lib/period';
import { HOME_SECTION } from '@/app/analytics/_lib/sections';
import { Button } from '@/shared/ui/components/button';

/** The home page asks about the same 7 days the strip shows */
const LAST_7_DAYS: Period = { preset: '7d' };

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomePage() {
  return (
    <AnalyticsProvider fixedPeriod={LAST_7_DAYS}>
      <AskPanelProvider>
        <Home />
        <AskPanel section={HOME_SECTION} overlay />
      </AskPanelProvider>
    </AnalyticsProvider>
  );
}

function Home() {
  const home = useHome();
  const loading = home.isLoading;
  // The hour is the viewer's, so it's set in the browser
  const [hello, setHello] = useState('Hello');
  useEffect(() => setHello(greeting(new Date().getHours())), []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 p-6 lg:p-8">
      <MetricsStrip data={home.data} loading={loading} />

      {home.isError && !home.data && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-viz-warning" aria-hidden />
          <span className="flex-1">The figures couldn&apos;t be loaded. You can still ask a question below.</span>
          <Button variant="ghost" size="sm" onClick={() => home.refetch()}>
            <RefreshCw className="mr-1.5 size-3.5" /> Try again
          </Button>
        </div>
      )}

      <section className="mx-auto max-w-2xl space-y-6 text-center">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">{hello}</h1>
          <p className="text-lg text-muted-foreground">Here&apos;s how your experiences are doing.</p>
        </div>
        <div className="text-left">
          <AskBox />
        </div>
        <TaskChips tasks={home.data?.tasks} loading={loading} />
      </section>

      {home.data?.checklist && <SetupChecklist steps={home.data.checklist} />}

      <HomeCards cards={home.data?.cards} tips={home.data?.tips} loading={loading} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ExperiencesList experiences={home.data?.experiences} loading={loading} />
        <RecentChanges changes={home.data?.recent} loading={loading} />
      </div>
    </div>
  );
}
