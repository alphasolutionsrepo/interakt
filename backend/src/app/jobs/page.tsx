// app/jobs/page.tsx

'use client';

import { Clock, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { JobsTable, JobTypeCard } from './_components';
import type { JobState } from './_lib/api-client';
import { useJobs, useJobTypes, useQueues, useSchedules } from './_lib/hooks/useJobs';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/shared/ui/custom/PageHeader';

const STATE_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All states' },
  { value: 'active', label: 'Active' },
  { value: 'created', label: 'Queued' },
  { value: 'retry', label: 'Retrying' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function JobsPage() {
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { data: jobTypes, isLoading: typesLoading } = useJobTypes();
  const { data: queues } = useQueues();
  const { data: schedules } = useSchedules();

  const listParams = {
    ...(stateFilter !== 'all' ? { state: stateFilter as JobState } : {}),
    ...(typeFilter !== 'all' ? { queue: typeFilter } : {}),
  };
  const { data: jobs, isLoading: jobsLoading, refetch } = useJobs(listParams);

  return (
    <div className="flex-1 space-y-8 p-6 lg:p-8">
      <PageHeader
        variant="settings"
        icon={Clock}
        title="Background Jobs"
        description="Run jobs on demand, schedule them, and review every run in the system"
        breadcrumb={
          <>
            <Clock className="size-4" />
            <span className="font-medium">Platform</span>
          </>
        }
        actions={
          <Button variant="outline" onClick={() => refetch()} className="rounded-xl">
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
        }
      />

      {/* Job types — run now + schedule */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Job Types</h2>
        {typesLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-48 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {jobTypes?.map(t => (
              <JobTypeCard
                key={t.queue}
                jobType={t}
                summary={queues?.find(q => q.name === t.queue)}
                schedule={schedules?.find(s => s.name === t.queue)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Runs — every job in the system */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Runs</h2>
          <div className="flex gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-48 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All job types</SelectItem>
                {jobTypes?.map(t => (
                  <SelectItem key={t.queue} value={t.queue}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="w-44 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATE_FILTERS.map(f => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <JobsTable jobs={jobs} isLoading={jobsLoading} />
      </section>
    </div>
  );
}
