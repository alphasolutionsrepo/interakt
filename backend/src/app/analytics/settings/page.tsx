// app/analytics/settings/page.tsx

'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, CircleOff, Database, Loader2, RefreshCw, Trash2 } from 'lucide-react';

import { useAnalyticsContext } from '../_lib/AnalyticsContext';
import { useProcessingStatus, useRefreshInsights } from '../_components/NeedsAttention';
import { formatTimeAgo } from '../_components/viz';
import { useDeleteAllSpans } from '../traces/_lib/hooks/useTraces';

import { Button } from '@/shared/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/components/card';
import { Skeleton } from '@/shared/ui/components/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/components/alert-dialog';

// ============================================================================
// DATA
// ============================================================================

const INSIGHTS_QUEUE = 'refresh-insights';
/** Matches the default the server sets at startup (job-registry.ts) */
const NIGHTLY_CRON = '0 2 * * *';

interface ScheduleRecord {
  name: string;
  cron: string;
  timezone: string | null;
}

/** null = the viewer may not see schedules (admin only) */
function useInsightsSchedule() {
  return useQuery({
    queryKey: ['analytics', 'settings', 'schedule'],
    queryFn: async (): Promise<ScheduleRecord | null | 'forbidden'> => {
      const res = await fetch('/api/jobs/schedules');
      if (res.status === 401 || res.status === 403) return 'forbidden';
      if (!res.ok) throw new Error('Failed to load schedules');
      const json = await res.json();
      return ((json.data as ScheduleRecord[]) ?? []).find((s) => s.name === INSIGHTS_QUEUE) ?? null;
    },
    staleTime: 60000,
  });
}

function useTrackingConfig() {
  return useQuery({
    queryKey: ['analytics', 'settings', 'config'],
    queryFn: async (): Promise<Record<string, boolean>> => {
      const res = await fetch('/api/analytics/config');
      if (!res.ok) throw new Error('Failed to load analytics settings');
      const json = await res.json();
      return json.data.config;
    },
    staleTime: 60000,
  });
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A cron schedule in words for the common shapes ("Every day at 02:00 UTC"); null for anything else */
function describeCron(cron: string, timezone: string): string | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const num = (v: string) => (/^\d{1,2}$/.test(v) ? Number(v) : null);
  const m = num(minute);
  const h = num(hour);
  if (m === null || month !== '*' || dayOfMonth !== '*') return null;
  const at = (hh: number) => `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')} ${timezone}`;
  if (hour === '*' && dayOfWeek === '*') return m === 0 ? 'Every hour, on the hour' : `Every hour at ${m} minutes past`;
  if (h === null) return null;
  if (dayOfWeek === '*') return `Every day at ${at(h)}`;
  const weekday = num(dayOfWeek);
  return weekday !== null && weekday <= 7 ? `Every ${WEEKDAYS[weekday % 7]} at ${at(h)}` : null;
}

/** Each tracking setting, what it means, and the env variable that sets it */
const TRACKING: Array<{ key: string; label: string; env: string }> = [
  { key: 'enabled', label: 'Analytics', env: 'ENABLE_ANALYTICS' },
  { key: 'trackSearchEvents', label: 'Searches', env: 'ANALYTICS_TRACK_SEARCH' },
  { key: 'trackAIUsage', label: 'AI model calls and tokens', env: 'ANALYTICS_TRACK_AI' },
  { key: 'trackToolExecutions', label: 'AI tool calls', env: 'ANALYTICS_TRACK_TOOLS' },
  { key: 'trackErrors', label: 'Errors', env: 'ANALYTICS_TRACK_ERRORS' },
  { key: 'trackSessions', label: 'Visitor sessions', env: 'ANALYTICS_TRACK_SESSIONS' },
  { key: 'trackClicks', label: 'Clicks on search results', env: 'ANALYTICS_TRACK_CLICKS' },
  { key: 'enableAnalyticsChat', label: 'Ask (analytics chat)', env: 'ANALYTICS_CHAT' },
];

// ============================================================================
// PAGE
// ============================================================================

/**
 * Settings: when insights refresh, what analytics records, and clearing data.
 */
export default function AnalyticsSettingsPage() {
  return (
    <div className="grid items-start gap-6 @3xl:grid-cols-2">
      <div className="space-y-6">
        <InsightsCard />
        <DataCard />
      </div>
      <TrackingCard />
    </div>
  );
}

function InsightsCard() {
  const { experienceId, experienceName } = useAnalyticsContext();
  const queryClient = useQueryClient();
  const schedule = useInsightsSchedule();
  const status = useProcessingStatus(experienceId);
  const onDone = useCallback(() => {
    status.refetch();
    queryClient.invalidateQueries({ queryKey: ['analytics', 'insights'] });
  }, [status, queryClient]);
  const { refresh, isProcessing } = useRefreshInsights(experienceId, onDone);
  const isRunning = isProcessing || status.data?.currentRun?.status === 'running';
  const lastRun = status.data?.lastRun;
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // The same nightly default the server sets at startup, for when it has no schedule yet
  const scheduleNightly = async () => {
    setScheduling(true);
    setScheduleError(null);
    try {
      const res = await fetch('/api/jobs/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue: INSIGHTS_QUEUE, cron: NIGHTLY_CRON, timezone: 'UTC' }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setScheduleError(json.error?.message ?? json.error ?? 'The schedule couldn’t be set.');
      }
      await schedule.refetch();
    } finally {
      setScheduling(false);
    }
  };

  return (
    <Card className="gap-4 rounded-2xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden /> Insights
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Insights power What needs attention, Conversations and Ask. They&apos;re computed in the background.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="space-y-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">Schedule</dt>
            <dd className="text-right">
              {schedule.isLoading ? (
                <Skeleton className="h-4 w-32" />
              ) : schedule.data === 'forbidden' ? (
                'Only admins can see the schedule'
              ) : schedule.data ? (
                <span title={`${schedule.data.cron} (${schedule.data.timezone ?? 'UTC'})`}>
                  {describeCron(schedule.data.cron, schedule.data.timezone ?? 'UTC') ?? (
                    <>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{schedule.data.cron}</code>{' '}
                      {schedule.data.timezone ?? 'UTC'}
                    </>
                  )}
                </span>
              ) : (
                'Not scheduled: insights refresh only on demand'
              )}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-muted-foreground">Last refresh ({experienceId ? experienceName : 'all experiences'})</dt>
            <dd>
              {isRunning ? (
                <span className="flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" /> Running now</span>
              ) : lastRun?.completedAt ? (
                `${formatTimeAgo(lastRun.completedAt)}${lastRun.status === 'failed' ? ', failed' : ''}`
              ) : (
                'Never'
              )}
            </dd>
          </div>
        </dl>
        {scheduleError && <p className="text-sm text-destructive">{scheduleError}</p>}
        <div className="flex flex-wrap gap-2">
          {schedule.data === null && (
            <Button size="sm" className="rounded-xl" onClick={scheduleNightly} disabled={scheduling}>
              {scheduling ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <CalendarClock className="mr-2 size-3.5" />}
              Schedule nightly refresh (02:00 UTC)
            </Button>
          )}
          <Button variant="outline" size="sm" className="rounded-xl" onClick={refresh} disabled={isRunning}>
            <RefreshCw className="mr-2 size-3.5" /> Refresh now
          </Button>
          <Button variant="link" size="sm" className="px-1" asChild>
            <Link href="/jobs">Change the schedule in Background Jobs</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TrackingCard() {
  const config = useTrackingConfig();

  return (
    <Card className="gap-4 rounded-2xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">What analytics records</CardTitle>
        <p className="text-sm text-muted-foreground">
          Set on the server with the environment variable shown, and applied on restart. How much detail chat traces keep is
          set on each experience.
        </p>
      </CardHeader>
      <CardContent>
        {config.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6" />)}
          </div>
        ) : config.isError ? (
          <p className="text-sm text-muted-foreground">Analytics settings couldn&apos;t be loaded.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th scope="col">Setting</th>
                <th scope="col">State</th>
                <th scope="col">Environment variable</th>
              </tr>
            </thead>
            <tbody>
              {TRACKING.filter((t) => t.key in (config.data ?? {})).map((t) => {
                const on = !!config.data?.[t.key];
                return (
                  <tr key={t.key} className="border-t first:border-t-0">
                    <td className="py-2 pr-3">{t.label}</td>
                    <td className="whitespace-nowrap py-2 pr-3">
                      <span className="flex items-center gap-1.5">
                        {on ? <CheckCircle2 className="size-3.5 text-viz-good" aria-hidden /> : <CircleOff className="size-3.5 text-muted-foreground" aria-hidden />}
                        {on ? 'On' : 'Off'}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{t.env}</code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function DataCard() {
  const { experienceId, experienceName } = useAnalyticsContext();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [confirmTraces, setConfirmTraces] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const deleteTraces = useDeleteAllSpans();

  const clearData = async () => {
    setIsClearing(true);
    try {
      await fetch('/api/analytics/data', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'all', experienceId }),
      });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    } finally {
      setIsClearing(false);
      setConfirm(false);
    }
  };

  return (
    <Card className="gap-4 rounded-2xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Database className="size-4 text-muted-foreground" aria-hidden /> Analytics data
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Delete recorded analytics for {experienceId ? experienceName : 'every experience'}: insights, traces, search events
          and saved chats. Experiences and their content are not affected.
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl text-destructive hover:bg-destructive/10"
          onClick={() => setConfirm(true)}
          disabled={isClearing}
        >
          {isClearing ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Trash2 className="mr-2 size-3.5" />}
          {experienceId ? `Clear data for ${experienceName}` : 'Clear all analytics data'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-xl text-destructive hover:bg-destructive/10"
          onClick={() => setConfirmTraces(true)}
          disabled={deleteTraces.isPending}
        >
          {deleteTraces.isPending ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Trash2 className="mr-2 size-3.5" />}
          Clear only traces, for every experience
        </Button>
      </CardContent>

      <AlertDialog open={confirmTraces} onOpenChange={setConfirmTraces}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all traces?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every recorded trace (chats, searches and AI summaries) for all experiences. Search events,
              insights and saved chats stay. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTraces.mutate(undefined, { onSettled: () => setConfirmTraces(false) })}
            >
              Clear traces
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {experienceId ? `Clear analytics data for ${experienceName}?` : 'Clear analytics data for ALL experiences?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {experienceId ? <>all analytics data for <strong>{experienceName}</strong></> : <><strong>all analytics data for every experience</strong></>}, including processed insights, spans, search events, and chat sessions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={clearData}>
              {experienceId ? 'Clear Experience Data' : 'Clear All Data'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
