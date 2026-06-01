// app/health/_lib/hooks/useHealth.ts

'use client';

import { useQuery } from '@tanstack/react-query';
import { healthApi } from '../api-client';

export const healthKeys = {
  all: ['health'] as const,
  system: () => [...healthKeys.all, 'system'] as const,
  database: () => [...healthKeys.all, 'database'] as const,
  elasticsearch: () => [...healthKeys.all, 'elasticsearch'] as const,
  aiProviders: () => [...healthKeys.all, 'ai-providers'] as const,
};

// Health checks already poll on an interval — retrying a failed request just
// turns one logged-out user into 4× the server log noise. And refetching on
// every window focus does the same thing for tab switches. Disable both.
const HEALTH_QUERY_DEFAULTS = {
  retry: false as const,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  staleTime: 10000,
} as const;

export function useSystemHealth(options?: { refetchInterval?: number }) {
  return useQuery({
    ...HEALTH_QUERY_DEFAULTS,
    queryKey: healthKeys.system(),
    queryFn: () => healthApi.getSystemHealth(),
    refetchInterval: options?.refetchInterval ?? 30000,
  });
}

export function useDatabaseHealth() {
  return useQuery({
    ...HEALTH_QUERY_DEFAULTS,
    queryKey: healthKeys.database(),
    queryFn: () => healthApi.getDatabaseHealth(),
    refetchInterval: 30000,
  });
}

export function useElasticsearchHealth() {
  return useQuery({
    ...HEALTH_QUERY_DEFAULTS,
    queryKey: healthKeys.elasticsearch(),
    queryFn: () => healthApi.getElasticsearchHealth(),
    refetchInterval: 30000,
  });
}

export function useAIProvidersHealth() {
  return useQuery({
    ...HEALTH_QUERY_DEFAULTS,
    queryKey: healthKeys.aiProviders(),
    queryFn: () => healthApi.getAIProvidersHealth(),
    refetchInterval: 30000,
  });
}
