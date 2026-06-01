// app/health/_lib/api-client.ts

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
    const response = await fetch('/api/health');
    if (!response.ok) {
      throw new Error('Failed to fetch system health');
    }
    const json = await response.json();
    return json.data;
  },

  async getDatabaseHealth(): Promise<ServiceHealth> {
    const response = await fetch('/api/health/database');
    if (!response.ok) {
      throw new Error('Failed to fetch database health');
    }
    const json = await response.json();
    return json.data;
  },

  async getElasticsearchHealth(): Promise<ServiceHealth> {
    const response = await fetch('/api/health/elasticsearch');
    if (!response.ok) {
      throw new Error('Failed to fetch Elasticsearch health');
    }
    const json = await response.json();
    return json.data;
  },

  async getAIProvidersHealth(): Promise<ServiceHealth> {
    const response = await fetch('/api/health/ai-providers');
    if (!response.ok) {
      throw new Error('Failed to fetch AI providers health');
    }
    const json = await response.json();
    return json.data;
  },
};
