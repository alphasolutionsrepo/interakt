// src/features/health/health.service.ts

/**
 * Health Monitoring Service
 *
 * Checks the health of all external dependencies and system components
 */

import { db } from '@/db/index';
import { sql } from 'drizzle-orm';
import { getDefaultSearchEngineProvider } from '@/features/search/providers';
import { createLogger } from '@/shared/logger/logger';
import * as aiProvidersRepo from '@/features/ai-providers/ai-providers.repository';
import { aiProvidersConfig, elasticsearchConfig, getProviderHealthConfig, type StatusPageResponse } from '@/config';

const logger = createLogger('health-service');

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ServiceHealth {
  name: string;
  status: HealthStatus;
  responseTime: number;
  message?: string;
  details?: Record<string, unknown>;
  lastChecked: Date;
}

export interface SystemHealth {
  status: HealthStatus;
  services: ServiceHealth[];
  timestamp: Date;
  uptime: number;
}

// ============================================================================
// Individual Health Checks
// ============================================================================

/**
 * Check Database Health
 */
export async function checkDatabaseHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();

  try {
    // Test query to check connection and measure query time
    await db.execute(sql`SELECT 1`);
    const queryTime = Date.now() - startTime;

    // Determine status based on query performance
    let status: HealthStatus = 'healthy';
    let message = `Query time: ${queryTime}ms`;

    if (queryTime > 1000) {
      status = 'unhealthy';
      message = `Slow queries detected (${queryTime}ms)`;
    } else if (queryTime > 500) {
      status = 'degraded';
      message = `Performance degraded (${queryTime}ms)`;
    }

    return {
      name: 'Database (PostgreSQL)',
      status,
      responseTime: queryTime,
      message,
      details: {
        queryTimeMs: queryTime,
        healthyThreshold: '< 500ms',
        degradedThreshold: '500-1000ms',
        unhealthyThreshold: '> 1000ms',
      },
      lastChecked: new Date(),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Database health check failed', error as Error);

    return {
      name: 'Database (PostgreSQL)',
      status: 'unhealthy',
      responseTime,
      message: error instanceof Error ? error.message : 'Connection failed',
      lastChecked: new Date(),
    };
  }
}

/**
 * Check Search Provider Health
 */
export async function checkElasticsearchHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();

  try {
    const provider = getDefaultSearchEngineProvider();
    const health = await provider.checkHealth();
    const queryTime = Date.now() - startTime;

    // Determine status based on provider status AND query performance
    let status: HealthStatus = 'healthy';
    let message = `Cluster: ${health.clusterStatus ?? 'unknown'}, Query: ${queryTime}ms`;

    // Check provider connection first
    if (!health.connected) {
      status = 'unhealthy';
      message = health.error ?? 'Connection failed';
    } else if (health.clusterStatus === 'red') {
      status = 'unhealthy';
      message = `Cluster status: red`;
    } else if (health.clusterStatus === 'yellow') {
      status = 'degraded';
      message = `Cluster status: yellow`;
    }
    // Then check query performance
    else if (queryTime > 2000) {
      status = 'unhealthy';
      message = `Slow queries (${queryTime}ms)`;
    } else if (queryTime > 1000) {
      status = 'degraded';
      message = `Performance degraded (${queryTime}ms)`;
    }

    // Extract host from URL for display (safe - no credentials)
    const esUrl = new URL(elasticsearchConfig.url);
    const endpointDisplay = `${esUrl.protocol}//${esUrl.host}`;

    return {
      name: `Search Provider (${provider.name})`,
      status,
      responseTime: queryTime,
      message,
      details: {
        providerType: provider.type,
        clusterName: health.clusterName,
        clusterStatus: health.clusterStatus,
        endpoint: endpointDisplay,
        queryTimeMs: queryTime,
        healthyThreshold: '< 1000ms',
        degradedThreshold: '1000-2000ms',
        unhealthyThreshold: '> 2000ms',
        numberOfNodes: health.numberOfNodes,
        version: health.version,
        ...health.details,
      },
      lastChecked: new Date(),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Search provider health check failed', error as Error);

    return {
      name: 'Search Provider',
      status: 'unhealthy',
      responseTime,
      message: error instanceof Error ? error.message : 'Connection failed',
      lastChecked: new Date(),
    };
  }
}

/**
 * Check health of a single provider using its configured health check method
 */
async function checkProviderHealth(
  provider: { id: string; providerKey: string; baseUrl: string }
): Promise<{ healthy: boolean; message: string; responseTimeMs: number; endpointTested: string }> {
  const startTime = Date.now();
  const config = getProviderHealthConfig(provider.providerKey);
  const timeout = aiProvidersConfig.healthCheck.timeoutMs;

  let url: string;
  let checkType: string;

  // Determine the URL to test
  if (config.healthCheckEndpoint) {
    if (config.healthCheckEndpoint.startsWith('http')) {
      // Absolute URL (e.g., status page API)
      url = config.healthCheckEndpoint;
      checkType = 'status-page';
    } else {
      // Relative to baseUrl (e.g., /api/tags for Ollama)
      url = `${provider.baseUrl}${config.healthCheckEndpoint}`;
      checkType = 'api-endpoint';
    }
  } else {
    // Fallback: test base URL directly
    url = provider.baseUrl;
    checkType = 'base-url';
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeout),
      headers: {
        'Accept': 'application/json',
      },
    });

    const responseTimeMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        healthy: false,
        message: `HTTP ${response.status}`,
        responseTimeMs,
        endpointTested: url,
      };
    }

    // For status page endpoints (OpenAI, Anthropic), parse the response
    if (checkType === 'status-page' && config.healthCheckEndpoint?.includes('status.json')) {
      try {
        const data = await response.json() as StatusPageResponse;
        const indicator = data.status?.indicator;

        if (indicator === 'none') {
          return { healthy: true, message: 'Operational', responseTimeMs, endpointTested: url };
        } else if (indicator === 'minor') {
          return { healthy: true, message: 'Minor issues', responseTimeMs, endpointTested: url };
        } else {
          return { healthy: false, message: data.status?.description || 'Service degraded', responseTimeMs, endpointTested: url };
        }
      } catch {
        // If we can't parse, but got 200, consider it healthy
        return { healthy: true, message: 'Reachable', responseTimeMs, endpointTested: url };
      }
    }

    return { healthy: true, message: 'Connected', responseTimeMs, endpointTested: url };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Provide user-friendly error messages
    if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED')) {
      return { healthy: false, message: 'Connection refused', responseTimeMs, endpointTested: url };
    }
    if (errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
      return { healthy: false, message: 'Connection timeout', responseTimeMs, endpointTested: url };
    }
    if (errorMessage.includes('ENOTFOUND')) {
      return { healthy: false, message: 'Host not found', responseTimeMs, endpointTested: url };
    }

    return { healthy: false, message: errorMessage, responseTimeMs, endpointTested: url };
  }
}

/**
 * Check AI Providers Health
 *
 * Performs live health checks against each enabled provider using:
 * - Official status page APIs for cloud providers (OpenAI, Anthropic, etc.)
 * - Local API endpoints for self-hosted providers (Ollama, LM Studio)
 *
 * Status determination:
 * - healthy: All providers are operational
 * - degraded: Some providers have issues
 * - unhealthy: All providers are down
 */
export async function checkAIProvidersHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();

  try {
    // Get all enabled providers
    const providers = await aiProvidersRepo.listProviders({ isEnabled: true });

    if (providers.length === 0) {
      return {
        name: 'AI Providers',
        status: 'degraded',
        responseTime: Date.now() - startTime,
        message: 'No providers configured',
        details: {
          totalProviders: 0,
          enabledProviders: 0,
        },
        lastChecked: new Date(),
      };
    }

    // Check all providers in parallel
    const healthResults = await Promise.all(
      providers.map(async (provider) => {
        const result = await checkProviderHealth({
          id: provider.id,
          providerKey: provider.providerKey,
          baseUrl: provider.baseUrl,
        });
        return {
          providerId: provider.id,
          providerKey: provider.providerKey,
          displayName: provider.displayName,
          ...result,
        };
      })
    );

    const responseTime = Date.now() - startTime;

    // Categorize results
    const healthyProviders = healthResults.filter(r => r.healthy);
    const failedProviders = healthResults.filter(r => !r.healthy);

    // Determine overall status
    let status: HealthStatus = 'healthy';
    let message = '';

    if (healthyProviders.length === 0) {
      status = 'unhealthy';
      message = `All ${providers.length} provider(s) unreachable`;
    } else if (failedProviders.length > 0) {
      status = 'degraded';
      message = `${healthyProviders.length}/${providers.length} providers operational`;
    } else {
      message = `All ${providers.length} provider(s) operational`;
    }

    // Build detailed provider status for UI
    const providerDetails = healthResults.map(r => ({
      name: r.displayName,
      key: r.providerKey,
      healthy: r.healthy,
      message: r.message,
      responseTimeMs: r.responseTimeMs,
      endpointTested: r.endpointTested,
    }));

    return {
      name: 'AI Providers',
      status,
      responseTime,
      message,
      details: {
        totalProviders: providers.length,
        healthyProviders: healthyProviders.length,
        failedProviders: failedProviders.length,
        providers: providerDetails,
      },
      lastChecked: new Date(),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('AI Providers health check failed', error as Error);

    return {
      name: 'AI Providers',
      status: 'unhealthy',
      responseTime,
      message: error instanceof Error ? error.message : 'Check failed',
      lastChecked: new Date(),
    };
  }
}

/**
 * Check Memory Usage
 */
export async function checkMemoryHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();

  try {
    const memUsage = process.memoryUsage();
    const responseTime = Date.now() - startTime;

    // Convert to MB
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);

    // Determine status based on heap usage percentage
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    let status: HealthStatus = 'healthy';
    if (heapUsagePercent > 90) {
      status = 'unhealthy';
    } else if (heapUsagePercent > 75) {
      status = 'degraded';
    }

    return {
      name: 'Memory',
      status,
      responseTime,
      message: `${heapUsedMB}MB / ${heapTotalMB}MB heap (${heapUsagePercent.toFixed(1)}%)`,
      details: {
        heapUsedMB,
        heapTotalMB,
        heapUsagePercent: parseFloat(heapUsagePercent.toFixed(1)),
        rssMB,
        externalMB: Math.round(memUsage.external / 1024 / 1024),
      },
      lastChecked: new Date(),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Memory health check failed', error as Error);

    return {
      name: 'Memory',
      status: 'unhealthy',
      responseTime,
      message: error instanceof Error ? error.message : 'Check failed',
      lastChecked: new Date(),
    };
  }
}

/**
 * Check System Uptime
 */
export async function checkSystemUptime(): Promise<ServiceHealth> {
  const startTime = Date.now();

  try {
    const uptimeSeconds = process.uptime();
    const responseTime = Date.now() - startTime;

    // Convert to human readable
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);

    let message = '';
    if (days > 0) message += `${days}d `;
    if (hours > 0) message += `${hours}h `;
    message += `${minutes}m`;

    return {
      name: 'Application',
      status: 'healthy',
      responseTime,
      message: `Uptime: ${message.trim()}`,
      details: {
        uptimeSeconds: Math.round(uptimeSeconds),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      lastChecked: new Date(),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('System uptime check failed', error as Error);

    return {
      name: 'Application',
      status: 'unhealthy',
      responseTime,
      message: error instanceof Error ? error.message : 'Check failed',
      lastChecked: new Date(),
    };
  }
}

// ============================================================================
// Main Health Check
// ============================================================================

/**
 * Check overall system health
 */
export async function checkSystemHealth(): Promise<SystemHealth> {
  const startTime = Date.now();

  try {
    // Run all health checks in parallel
    // Only check external dependencies (Database, Elasticsearch, AI Providers)
    // Exclude Memory and Uptime as they are not meaningful in serverless environments
    const [
      dbHealth,
      esHealth,
      aiHealth,
    ] = await Promise.all([
      checkDatabaseHealth(),
      checkElasticsearchHealth(),
      checkAIProvidersHealth(),
    ]);

    const services = [dbHealth, esHealth, aiHealth];

    // Determine overall status
    const hasUnhealthy = services.some(s => s.status === 'unhealthy');
    const hasDegraded = services.some(s => s.status === 'degraded');

    let overallStatus: HealthStatus = 'healthy';
    if (hasUnhealthy) {
      overallStatus = 'unhealthy';
    } else if (hasDegraded) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      services,
      timestamp: new Date(),
      uptime: Math.round(process.uptime()),
    };
  } catch (error) {
    logger.error('System health check failed', error as Error);

    return {
      status: 'unhealthy',
      services: [],
      timestamp: new Date(),
      uptime: Math.round(process.uptime()),
    };
  }
}
