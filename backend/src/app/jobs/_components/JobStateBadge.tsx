// app/jobs/_components/JobStateBadge.tsx

import type { JobState } from '../_lib/api-client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATE_STYLES: Record<JobState, string> = {
  created: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  retry: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  active: 'bg-violet-500/10 text-violet-600 border-violet-500/20 animate-pulse',
  completed: 'bg-green-500/10 text-green-600 border-green-500/20',
  cancelled: 'bg-muted text-muted-foreground border-border',
  failed: 'bg-red-500/10 text-red-600 border-red-500/20',
};

export function JobStateBadge({ state }: { state: JobState }) {
  return (
    <Badge variant="outline" className={cn('capitalize', STATE_STYLES[state])}>
      {state}
    </Badge>
  );
}
