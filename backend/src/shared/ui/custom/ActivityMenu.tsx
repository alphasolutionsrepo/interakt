'use client';

// src/shared/ui/custom/ActivityMenu.tsx
//
// The header's Activity button: a dot when something failed that the user hasn't
// looked at, and a panel listing recent failed actions and finished background work,
// newest first. Each entry says what happened and what to try, with the technical
// details and request id collapsed and a Copy button for support. The list lives in
// this browser (shared/activity/activity-store.ts).

import { AlertCircle, CheckCircle2, ExternalLink, History, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ErrorDetails } from './ErrorDetails';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { activityStore, entryAsText, type ActivityEntry } from '@/shared/activity/activity-store';
import { OPEN_ACTIVITY_EVENT, type OpenActivityDetail } from '@/shared/activity/report';
import { useActivity } from '@/shared/activity/useActivity';

export function ActivityMenu() {
  const entries = useActivity();
  const [open, setOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | undefined>();
  const unread = entries.filter((e) => !e.read && (e.kind === 'error' || e.status === 'failed')).length;

  // Details on a notice opens the panel at that entry
  useEffect(() => {
    const onOpen = (event: Event) => {
      setFocusId((event as CustomEvent<OpenActivityDetail>).detail?.entryId);
      setOpen(true);
    };
    window.addEventListener(OPEN_ACTIVITY_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ACTIVITY_EVENT, onOpen);
  }, []);

  // Looking at the list counts as having seen it
  useEffect(() => {
    if (open) activityStore.markAllRead();
  }, [open, entries.length]);

  useEffect(() => {
    if (open && focusId) document.getElementById(`activity-${focusId}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, focusId]);

  return (
    <Sheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) setFocusId(undefined); }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Activity, ${unread} new problems` : 'Activity'}>
              <History className="size-5" />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent>Activity</TooltipContent>
      </Tooltip>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Activity</SheetTitle>
          <SheetDescription>Recent problems with your actions, and background work as it finishes. Kept in this browser.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nothing yet. When an action fails, what went wrong and what to try shows up here.</p>
          ) : (
            <ul className="divide-y">
              {entries.map((entry) => (
                <ActivityItem key={entry.id} entry={entry} focused={entry.id === focusId} onNavigate={() => setOpen(false)} />
              ))}
            </ul>
          )}
        </div>
        {entries.length > 0 && (
          <div className="border-t p-3">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => activityStore.clear()}>
              <Trash2 className="mr-1.5 size-3.5" />
              Clear
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ActivityItem({ entry, focused, onNavigate }: { entry: ActivityEntry; focused: boolean; onNavigate: () => void }) {
  const failed = entry.kind === 'error' || entry.status === 'failed';
  return (
    <li id={`activity-${entry.id}`} className={cn('space-y-1 px-4 py-3 text-sm', focused && 'bg-muted/50')}>
      <div className="flex items-start gap-2">
        {failed ? (
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">
              {entry.action}
              {failed ? ' failed' : entry.kind === 'job' ? ' finished' : ''}
            </span>
            <time className="shrink-0 text-xs text-muted-foreground" dateTime={entry.at} title={new Date(entry.at).toLocaleString()}>
              {formatWhen(entry.at)}
            </time>
          </div>
          <p className={cn(failed ? 'text-foreground' : 'text-muted-foreground')}>{entry.message}</p>
          {entry.hint && <p className="text-muted-foreground">{entry.hint}</p>}
          {entry.href && (
            <Link href={entry.href} onClick={onNavigate} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Open <ExternalLink className="size-3" />
            </Link>
          )}
          {failed && (
            <ErrorDetails
              code={entry.code}
              httpStatus={entry.httpStatus}
              details={entry.details}
              requestId={entry.requestId}
              copyText={entryAsText(entry)}
            />
          )}
        </div>
      </div>
    </li>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}
