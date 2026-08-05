// app/jobs/_components/RunJobDialog.tsx

'use client';

import { useEffect, useMemo, useState } from 'react';

import type { JobTypeInfo } from '../_lib/api-client';
import { useEnqueueJob } from '../_lib/hooks/useJobs';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';


/**
 * Run a single job type on demand. Payload is prefilled from the type's example
 * and editable as raw JSON (validated as an object client- and server-side).
 */
export function RunJobDialog({
  jobType,
  open,
  onOpenChange,
}: {
  jobType: JobTypeInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [payload, setPayload] = useState('{}');
  const enqueue = useEnqueueJob();

  useEffect(() => {
    if (open && jobType) setPayload(JSON.stringify(jobType.payloadExample ?? {}, null, 2));
  }, [open, jobType]);

  const jsonError = useMemo(() => {
    if (!payload.trim()) return null;
    try {
      const parsed = JSON.parse(payload);
      if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
        return 'Payload must be a JSON object';
      }
      return null;
    } catch {
      return 'Invalid JSON';
    }
  }, [payload]);

  if (!jobType) return null;

  const run = () => {
    if (jsonError) return;
    const data = payload.trim() ? JSON.parse(payload) : {};
    enqueue.mutate(
      { queue: jobType.queue, data },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Run — {jobType.label}</DialogTitle>
          <DialogDescription>{jobType.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Payload (JSON)</Label>
          <Textarea
            value={payload}
            onChange={e => setPayload(e.target.value)}
            rows={6}
            spellCheck={false}
            className="rounded-xl font-mono text-xs"
          />
          {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="rounded-xl" onClick={run} disabled={!!jsonError || enqueue.isPending}>
            Run now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
