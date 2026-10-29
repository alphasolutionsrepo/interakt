// app/dashboard/_lib/useHome.ts

'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { browserTimeZone } from '@/app/analytics/_lib/period';
import type { HomeData } from '@/features/dashboard/home.service';
import { toApiError } from '@/shared/api/api-error';

export type {
  HomeCard,
  HomeChange,
  HomeChecklistStep,
  HomeData,
  HomeExperience,
  HomeHealth,
  HomeMetric,
  HomeTask,
  HomeTip,
} from '@/features/dashboard/home.service';

const homeKey = ['home'] as const;

/** Everything the home page shows, refreshed every minute in the background */
export function useHome() {
  return useQuery({
    queryKey: homeKey,
    queryFn: async (): Promise<HomeData> => {
      const res = await fetch(`/api/dashboard/home?tz=${encodeURIComponent(browserTimeZone())}`);
      if (!res.ok) throw new Error('Failed to load the home page');
      return (await res.json()).data;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Dismiss a tip for good; it disappears straight away */
export function useDismissTip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tipId: string) => {
      const res = await fetch('/api/dashboard/home/tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipId }),
      });
      if (!res.ok) throw await toApiError(res, 'Failed to dismiss the tip');
    },
    meta: { label: 'Dismiss tip' },
    onMutate: (tipId) => {
      queryClient.setQueryData<HomeData>(homeKey, (data) =>
        data
          ? {
              ...data,
              tips: data.tips.filter((t) => t.id !== tipId),
              // The getting-started list is hidden the same way
              checklist: tipId === 'tip:checklist' ? null : data.checklist,
            }
          : data,
      );
    },
    onError: () => queryClient.invalidateQueries({ queryKey: homeKey }),
  });
}
