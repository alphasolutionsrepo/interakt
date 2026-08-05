// app/jobs/_components/JobTypeCard.tsx

'use client';

import cronstrue from 'cronstrue';
import { CalendarClock, CalendarPlus, Loader2, ListChecks, Play } from 'lucide-react';
import { useState } from 'react';


import type { JobTypeInfo, QueueSummary, ScheduleRecord } from '../_lib/api-client';

import { RunJobDialog } from './RunJobDialog';
import { ScheduleDialog } from './ScheduleDialog';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';



function humanCron(cron: string): string {
  try {
    return cronstrue.toString(cron, { use24HourTimeFormat: false });
  } catch {
    return cron;
  }
}

export function JobTypeCard({
  jobType,
  summary,
  schedule,
}: {
  jobType: JobTypeInfo;
  summary?: QueueSummary;
  schedule?: ScheduleRecord;
}) {
  const [runOpen, setRunOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  return (
    <Card className="flex flex-col gap-4 rounded-2xl p-5">
      <div className="space-y-1">
        <h3 className="font-semibold">{jobType.label}</h3>
        <p className="text-sm text-muted-foreground">{jobType.description}</p>
      </div>

      {/* Live counts */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5">
          <Loader2 className="size-4 text-violet-500" />
          <span className="font-medium tabular-nums">{summary?.activeCount ?? 0}</span>
          <span className="text-xs text-muted-foreground">active</span>
        </span>
        <span className="flex items-center gap-1.5">
          <ListChecks className="size-4 text-blue-500" />
          <span className="font-medium tabular-nums">{summary?.queuedCount ?? 0}</span>
          <span className="text-xs text-muted-foreground">queued</span>
        </span>
      </div>

      {/* Schedule status */}
      <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm">
        <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
        {schedule ? (
          <span>
            <span className="font-medium">{humanCron(schedule.cron)}</span>{' '}
            <span className="text-muted-foreground">({schedule.cron})</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Not scheduled</span>
        )}
      </div>

      <div className="mt-auto flex gap-2">
        <Button className="flex-1 rounded-xl" onClick={() => setRunOpen(true)}>
          <Play className="mr-2 size-4" />
          Run now
        </Button>
        <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setScheduleOpen(true)}>
          {schedule ? (
            <>
              <CalendarClock className="mr-2 size-4" />
              Edit schedule
            </>
          ) : (
            <>
              <CalendarPlus className="mr-2 size-4" />
              Schedule
            </>
          )}
        </Button>
      </div>

      <RunJobDialog jobType={jobType} open={runOpen} onOpenChange={setRunOpen} />
      <ScheduleDialog
        jobType={jobType}
        currentCron={schedule?.cron}
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
      />
    </Card>
  );
}
