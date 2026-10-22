// app/analytics/_components/TimeRangeSelector.tsx

'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/components/select';
import { Clock } from 'lucide-react';
import { useAnalyticsContext, TIME_RANGE_OPTIONS } from '../_lib/AnalyticsContext';
import type { TimeRange } from '../_lib/hooks/useAnalytics';

interface TimeRangeSelectorProps {
  compact?: boolean;
}

/** Time range picker shared by the analytics pages (the selection carries across them) */
export function TimeRangeSelector({ compact = false }: TimeRangeSelectorProps) {
  const { timeRange, setTimeRange } = useAnalyticsContext();

  return (
    <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
      <SelectTrigger className={compact ? 'w-[150px] h-8 text-xs rounded-lg' : 'w-[160px] rounded-xl'}>
        <Clock className={compact ? 'mr-1.5 size-3 text-muted-foreground' : 'mr-2 size-4 text-muted-foreground'} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TIME_RANGE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
