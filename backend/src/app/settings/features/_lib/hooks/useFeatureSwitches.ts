// app/settings/features/_lib/hooks/useFeatureSwitches.ts

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { getFeatures, updateFeatures } from '../api-client';
import { featureKeys, invalidateAfterSave, saveErrorText } from '../feature-toggle';

export { featureKeys };

export function useFeatures() {
  return useQuery({ queryKey: featureKeys.all, queryFn: getFeatures, staleTime: 30_000 });
}

export function useUpdateFeatures() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateFeatures,
    onSuccess: () => {
      toast.success('Features updated');
      // The list, and the menu (it follows what is on) update at once
      invalidateAfterSave(queryClient);
    },
    onError: (error) => toast.error(saveErrorText(error)),
    meta: { label: 'Update features' },
  });
}
