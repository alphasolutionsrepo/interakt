// shared/ui/custom/provider-model-queries.ts

/**
 * What an experience's provider and model pickers read: the providers with their
 * models, and the system default chat model. One query each, shared by every picker.
 */

import { handleApiResponse } from '@/shared/api/api-error';

export interface ProviderChoice {
  id: string;
  key: string;
  name: string;
  models: Array<{ id: number; key: string; name: string; type: string }>;
}

export interface ResolvedChatDefault {
  chat: { providerId: string | null; providerKey: string | null; modelId: number | null; modelKey: string | null };
}

export const providerChoicesQuery = {
  queryKey: ['ai-providers-for-experience'],
  queryFn: async () => handleApiResponse<{ providers: ProviderChoice[] }>(await fetch('/api/ai-service/providers'), 'Failed to load AI providers'),
};

export const resolvedDefaultsQuery = {
  queryKey: ['system-defaults-ai-resolved'],
  queryFn: async () => handleApiResponse<ResolvedChatDefault>(await fetch('/api/system-defaults/ai/resolved'), 'Failed to load the system default model'),
};
