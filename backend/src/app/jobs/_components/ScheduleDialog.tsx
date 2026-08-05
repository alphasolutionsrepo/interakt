// app/jobs/_components/ScheduleDialog.tsx

'use client';

import cronstrue from 'cronstrue';
import { CalendarClock, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';


import type { JobTypeInfo } from '../_lib/api-client';
import { useRemoveSchedule, useSetSchedule } from '../_lib/hooks/useJobs';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';


const PRESETS: Array<{ label: string; cron: string }> = [
  { label: 'Hourly', cron: '0 * * * *' },
  { label: 'Daily 3 AM', cron: '0 3 * * *' },
  { label: 'Weekly (Mon 6 AM)', cron: '0 6 * * 1' },
  { label: 'Monthly (1st, 2 AM)', cron: '0 2 1 * *' },
];

/** Describe a cron expression in English, or return an error string. */
function describe(cron: string): { text?: string; error?: string } {
  if (!cron.trim()) return { error: 'Enter a cron expression' };
  try {
    return { text: cronstrue.toString(cron, { use24HourTimeFormat: false }) };
  } catch {
    return { error: 'Invalid cron expression' };
  }
}

export function ScheduleDialog({
  jobType,
  currentCron,
  open,
  onOpenChange,
}: {
  jobType: JobTypeInfo | null;
  currentCron?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [cron, setCron] = useState('');
  const setSchedule = useSetSchedule();
  const removeSchedule = useRemoveSchedule();

  // Seed the field with the existing schedule (or a sensible default) on open.
  useEffect(() => {
    if (open) setCron(currentCron || '0 3 * * *');
  }, [open, currentCron]);

  const preview = useMemo(() => describe(cron), [cron]);

  if (!jobType) return null;

  const save = () => {
    if (preview.error) return;
    setSchedule.mutate(
      { queue: jobType.queue, cron: cron.trim() },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const remove = () => {
    removeSchedule.mutate(jobType.queue, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="size-5 text-primary" />
            Schedule — {jobType.label}
          </DialogTitle>
          <DialogDescription>
            Run this job automatically on a recurring schedule. Saved schedules
            persist and survive restarts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <Button
                key={p.cron}
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => setCron(p.cron)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Cron expression</Label>
            <Input
              value={cron}
              onChange={e => setCron(e.target.value)}
              placeholder="0 3 * * *"
              spellCheck={false}
              className="rounded-xl font-mono"
            />
            {preview.error ? (
              <p className="text-xs text-destructive">{preview.error}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Runs: <span className="font-medium text-foreground">{preview.text}</span>
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            className="rounded-xl text-destructive hover:text-destructive"
            onClick={remove}
            disabled={!currentCron || removeSchedule.isPending}
          >
            <Trash2 className="mr-2 size-4" />
            Remove schedule
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              onClick={save}
              disabled={!!preview.error || setSchedule.isPending}
            >
              Save schedule
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
