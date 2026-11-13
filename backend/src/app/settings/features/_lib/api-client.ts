// app/settings/features/_lib/api-client.ts

import type { UpdateBody, FeatureRow } from './feature-rows';

import { handleApiResponse } from '@/shared/api/api-error';

export async function getFeatures(): Promise<FeatureRow[]> {
  const data = await handleApiResponse<{ areas: FeatureRow[] }>(await fetch('/api/settings/features'));
  return data.areas;
}

export async function updateFeatures(body: UpdateBody): Promise<FeatureRow[]> {
  const data = await handleApiResponse<{ areas: FeatureRow[] }>(
    await fetch('/api/settings/features', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    'Could not save the change',
  );
  return data.areas;
}
