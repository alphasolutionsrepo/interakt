// app/jobs/_components/JobsTable.tsx

'use client';

import { MoreHorizontal, RotateCcw, Ban, Play, Trash2, Eye } from 'lucide-react';
import { useState } from 'react';

import type { JobAction, JobRecord, JobState } from '../_lib/api-client';
import { useJobAction } from '../_lib/hooks/useJobs';

import { JobStateBadge } from './JobStateBadge';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';



/** Which actions make sense for a given job state. */
function actionsFor(state: JobState): JobAction[] {
  switch (state) {
    case 'created':
    case 'retry':
      return ['cancel', 'delete'];
    case 'active':
      return ['cancel'];
    case 'failed':
      return ['retry', 'delete'];
    case 'cancelled':
      return ['resume', 'retry', 'delete'];
    case 'completed':
      return ['retry', 'delete'];
    default:
      return ['delete'];
  }
}

const ACTION_META: Record<JobAction, { label: string; icon: React.ElementType; danger?: boolean }> = {
  retry: { label: 'Retry', icon: RotateCcw },
  cancel: { label: 'Cancel', icon: Ban },
  resume: { label: 'Resume', icon: Play },
  delete: { label: 'Delete', icon: Trash2, danger: true },
};

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

export function JobsTable({
  jobs,
  isLoading,
}: {
  jobs?: JobRecord[];
  isLoading: boolean;
}) {
  const action = useJobAction();
  const [detail, setDetail] = useState<JobRecord | null>(null);

  if (isLoading) {
    return (
      <Card className="rounded-2xl p-4">
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (!jobs?.length) {
    return (
      <Card className="rounded-2xl p-8 text-center text-sm text-muted-foreground">
        No jobs yet. Enqueue one with the actions above.
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Queue</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Retries</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Completed</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map(job => (
              <TableRow key={`${job.queue}:${job.id}`}>
                <TableCell className="font-medium">{job.queue}</TableCell>
                <TableCell>
                  <JobStateBadge state={job.state} />
                </TableCell>
                <TableCell className="tabular-nums text-sm text-muted-foreground">
                  {job.retryCount}/{job.retryLimit}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmt(job.createdOn)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmt(job.completedOn)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDetail(job)}>
                        <Eye className="mr-2 size-4" /> View details
                      </DropdownMenuItem>
                      {actionsFor(job.state).map(a => {
                        const meta = ACTION_META[a];
                        const Icon = meta.icon;
                        return (
                          <DropdownMenuItem
                            key={a}
                            disabled={action.isPending}
                            className={meta.danger ? 'text-destructive focus:text-destructive' : ''}
                            onClick={() =>
                              action.mutate({ queue: job.queue, id: job.id, action: a })
                            }
                          >
                            <Icon className="mr-2 size-4" /> {meta.label}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!detail} onOpenChange={open => !open && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detail?.queue}
              {detail && <JobStateBadge state={detail.state} />}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <div>ID</div>
                <div className="font-mono text-xs text-foreground">{detail.id}</div>
                <div>Created</div>
                <div className="text-foreground">{fmt(detail.createdOn)}</div>
                <div>Started</div>
                <div className="text-foreground">{fmt(detail.startedOn)}</div>
                <div>Completed</div>
                <div className="text-foreground">{fmt(detail.completedOn)}</div>
              </div>
              <Section title="Payload" value={detail.data} />
              <Section title="Output" value={detail.output} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Section({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <div className="mb-1 font-medium">{title}</div>
      <pre className="max-h-60 overflow-auto rounded-lg bg-muted p-3 text-xs">
        {value == null ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
