// app/settings/features/_lib/hooks/useFeatureSwitches.ts

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { getFeatures, updateFeatures } from '../api-client';

import { accessKeys } from '@/shared/access/useAccess';
import { errorText } from '@/shared/api/api-error';

export const featureKeys = { all: ['settings', 'features'] as const };

export function useFeatures() {
  return useQuery({ queryKey: featureKeys.all, queryFn: getFeatures, staleTime: 30_000 });
}

export function useUpdateFeatures() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateFeatures,
    onSuccess: () => {
      toast.success('Features updated');
      queryClient.invalidateQueries({ queryKey: featureKeys.all });
      // The menu follows what is on, so it updates at once
      queryClient.invalidateQueries({ queryKey: accessKeys.mine });
    },
    onError: (error) => toast.error(errorText(error, 'Could not save the change')),
    meta: { label: 'Update features' },
  });
}
