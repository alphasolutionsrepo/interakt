// app/health/_lib/api-client.ts

import { handleApiResponse } from '@/shared/api/api-error';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ServiceHealth {
  name: string;
  status: HealthStatus;
  responseTime: number;
  message?: string;
  details?: Record<string, unknown>;
  lastChecked: string;
}

export interface SystemHealth {
  status: HealthStatus;
  services: ServiceHealth[];
  timestamp: string;
  uptime: number;
}

export const healthApi = {
  async getSystemHealth(): Promise<SystemHealth> {
    return handleApiResponse<SystemHealth>(await fetch('/api/health'), 'Failed to fetch system health');
  },

  async getDatabaseHealth(): Promise<ServiceHealth> {
    return handleApiResponse<ServiceHealth>(await fetch('/api/health/database'), 'Failed to fetch database health');
  },

  async getElasticsearchHealth(): Promise<ServiceHealth> {
    return handleApiResponse<ServiceHealth>(await fetch('/api/health/elasticsearch'), 'Failed to fetch Elasticsearch health');
  },

  async getAIProvidersHealth(): Promise<ServiceHealth> {
    return handleApiResponse<ServiceHealth>(await fetch('/api/health/ai-providers'), 'Failed to fetch AI providers health');
  },
};
