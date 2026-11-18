// src/features/health/health.service.ts

/**
 * Health Monitoring Service
 *
 * Checks the health of all external dependencies and system components
 */

import { sql } from 'drizzle-orm';

import { aiProvidersConfig, elasticsearchConfig, getProviderHealthConfig, type StatusPageResponse } from '@/config';
import { db } from '@/db/index';
import * as aiProvidersRepo from '@/features/ai-providers/ai-providers.repository';
import { defaultConnectionType, type AIConnectionType } from '@/features/ai-providers/ai-providers.validation';
import { ollamaHeaders } from '@/features/ai-service/adapters/ollama-headers';
import { getDefaultSearchEngineProvider } from '@/features/search/providers';
import { clientAddressSetup, SHARED_LIMIT_FACTOR, type ClientAddressSetup } from '@/shared/api/client-ip';
import { fetchOnSameServer, RedirectedElsewhereError } from '@/shared/http/same-server-fetch';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('health-service');

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ServiceHealth {
  name: string;
  status: HealthStatus;
  responseTime: number;
  message?: string;
  details?: Record<string, unknown>;
  /** A check of settings, not a live call: left out of the average response time */
  configOnly?: boolean;
  /** What the home page asks the admin to do when this isn't healthy (default: "<name> is degraded") */
  task?: string;
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

/** Protocol and host of the engine in use (never credentials, path or query), or undefined when it has none. */
function searchEndpoint(type: string): string | undefined {
  const raw = type === 'elasticsearch' ? elasticsearchConfig.url : type === 'azure-ai-search' ? process.env.AZURE_SEARCH_ENDPOINT : undefined;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return undefined;
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
    const isElasticsearch = provider.type === 'elasticsearch';
    let message = isElasticsearch ? `Cluster: ${health.clusterStatus ?? 'unknown'}, Query: ${queryTime}ms` : `Query: ${queryTime}ms`;

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

    const endpointDisplay = searchEndpoint(provider.type);

    return {
      name: `Search Provider (${provider.name})`,
      status,
      responseTime: queryTime,
      message,
      details: {
        providerType: provider.type,
        // Cluster fields are Elasticsearch's; the address is the engine in use, left out when unknown
        ...(isElasticsearch && { clusterName: health.clusterName, clusterStatus: health.clusterStatus }),
        ...(endpointDisplay && { endpoint: endpointDisplay }),
        queryTimeMs: queryTime,
        healthyThreshold: '< 1000ms',
        degradedThreshold: '1000-2000ms',
        unhealthyThreshold: '> 2000ms',
        ...(isElasticsearch && { numberOfNodes: health.numberOfNodes, version: health.version }),
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
type ProviderToCheck = { id: string; providerKey: string; baseUrl: string; connectionType?: AIConnectionType | null; apiKey?: string | null };

/** Whether a provider's base URL is on the vendor's own domain (status.openai.com → openai.com) */
function onVendorDomain(baseUrl: string, statusPageUrl: string): boolean {
  try {
    const vendor = new URL(statusPageUrl).hostname.replace(/^status\./, '');
    const host = new URL(baseUrl).hostname;
    return host === vendor || host.endsWith(`.${vendor}`);
  } catch {
    return false;
  }
}

/**
 * What to ask a provider: the vendor's status page when the provider is that vendor's own
 * service; otherwise the provider itself, as its connection type answers (an OpenAI-compatible
 * model list, or Ollama's installed models), with its key when it has one.
 */
function providerHealthRequest(provider: ProviderToCheck): { url: string; headers: Record<string, string>; checkType: string } {
  const config = getProviderHealthConfig(provider.providerKey);
  const statusPage = config.healthCheckEndpoint?.startsWith('http') ? config.healthCheckEndpoint : undefined;
  if (statusPage && config.statusPageUrl && onVendorDomain(provider.baseUrl, config.statusPageUrl)) {
    return { url: statusPage, headers: { Accept: 'application/json' }, checkType: 'status-page' };
  }
  const baseUrl = provider.baseUrl.replace(/\/+$/, '');
  if ((provider.connectionType ?? defaultConnectionType(provider.providerKey)) === 'ollama') {
    return { url: `${baseUrl}/api/tags`, headers: { Accept: 'application/json', ...ollamaHeaders(provider.apiKey) }, checkType: 'api-endpoint' };
  }
  return {
    url: `${baseUrl}/models`,
    headers: { Accept: 'application/json', ...(provider.apiKey && { Authorization: `Bearer ${provider.apiKey}` }) },
    checkType: 'api-endpoint',
  };
}

async function checkProviderHealth(
  provider: ProviderToCheck
): Promise<{ healthy: boolean; message: string; responseTimeMs: number; endpointTested: string }> {
  const startTime = Date.now();
  const config = getProviderHealthConfig(provider.providerKey);
  const timeout = aiProvidersConfig.healthCheck.timeoutMs;
  const { url, headers, checkType } = providerHealthRequest(provider);

  try {
    // A vendor's status page is a fixed public address with nothing of ours sent: its own
    // redirects are followed (a vendor moves it). The provider itself is checked on its server only.
    const request = { method: 'GET', signal: AbortSignal.timeout(timeout), headers };
    const response = checkType === 'status-page' ? await fetch(url, request) : await fetchOnSameServer(url, request);

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

    // Health is read by roles that don't see provider addresses: the other server isn't named
    if (error instanceof RedirectedElsewhereError) {
      return { healthy: false, message: 'Redirected to another server (not followed)', responseTimeMs, endpointTested: url };
    }

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

    // fetch quotes the address (password included) when it can't build the request. The address
    // belongs in endpointTested only, which roles without ai-providers:view never get.
    if (error instanceof TypeError) {
      return { healthy: false, message: 'Invalid provider address', responseTimeMs, endpointTested: url };
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
          connectionType: provider.connectionType,
          apiKey: provider.apiKey,
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

/** The healthy text, true for every count: what the source is, and what requests have shown so far */
function clientAddressHealthyMessage(setup: ClientAddressSetup): string {
  const total = setup.trustedRequests + setup.untrustedRequests;
  const base = `Client addresses are read from what is in front of Interakt (${setup.source})`;
  if (total === 0) return `${base}; no requests have needed one yet.`;
  if (setup.untrustedRequests > 0) return `${base}; ${setup.untrustedRequests} of ${total} requests in the last hour had no trusted address.`;
  return `${base}.`;
}

/** What each client-address problem means, and what to do about it */
function clientAddressMessage(setup: ClientAddressSetup): string {
  const shared = `Until it is fixed, those requests share one rate-limit count at ${SHARED_LIMIT_FACTOR}× the per-client limit.`;
  switch (setup.problem) {
    case 'none':
      return `CLIENT_IP_SOURCE is none: nothing is in front of Interakt, so client addresses aren't known. Not recommended for production: put a reverse proxy or gateway in front and set CLIENT_IP_SOURCE to match. Until then, every request shares one rate-limit count at ${SHARED_LIMIT_FACTOR}× the per-client limit.`;
    case 'invalid-setting':
      if (setup.invalid === 'hops') {
        return `TRUSTED_PROXY_HOPS isn't a whole number from 1, so Interakt is using ${setup.source} until it is fixed. Set it to the number of proxies in front of Interakt.`;
      }
      return `CLIENT_IP_SOURCE isn't a value Interakt understands, so Interakt is using ${setup.source} until it is fixed. Set it to forwarded-for:<proxies>, header:<name> or none.`;
    case 'short-list':
      return `In the last hour, ${setup.untrustedRequests} requests had no client address Interakt can trust: the latest arrived with fewer X-Forwarded-For entries than the proxies CLIENT_IP_SOURCE expects in front (${setup.hops ?? 0}). Check how many proxies are in front and set forwarded-for to that number. ${shared}`;
    case 'missing-header':
      return `In the last hour, ${setup.untrustedRequests} requests had no client address Interakt can trust: in the latest, the header named in CLIENT_IP_SOURCE (${setup.source}) didn't arrive. Check that the edge sends it and that the setting matches what is in front of Interakt. ${shared}`;
    case 'not-an-address':
      return `In the last hour, ${setup.untrustedRequests} requests had no client address Interakt can trust: in the latest, the place CLIENT_IP_SOURCE (${setup.source}) points to held something that isn't an IP address. Check that the setting matches what is in front of Interakt. ${shared}`;
    default:
      return clientAddressHealthyMessage(setup);
  }
}

/**
 * Check how client addresses are read, for per-client rate limits (CLIENT_IP_SOURCE).
 * Degraded when the setting is none or not valid, or when requests in the last hour showed
 * the proxies in front don't match it. What this server saw only: no network calls.
 */
export async function checkClientAddressHealth(): Promise<ServiceHealth> {
  const setup = clientAddressSetup();
  return {
    name: 'Client addresses',
    status: setup.problem ? 'degraded' : 'healthy',
    responseTime: 0,
    configOnly: true,
    message: clientAddressMessage(setup),
    details: {
      setting: setup.source,
      requestsWithAddress: setup.trustedRequests,
      requestsWithoutAddress: setup.untrustedRequests,
      ...(setup.problemSeenAt ? { problemLastSeen: setup.problemSeenAt } : {}),
    },
    ...(setup.problem ? { task: 'Check how client addresses are read' } : {}),
    lastChecked: new Date(),
  };
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
    // External dependencies (Database, Elasticsearch, AI Providers) and the client-address setup
    // Exclude Memory and Uptime as they are not meaningful in serverless environments
    const [
      dbHealth,
      esHealth,
      aiHealth,
      clientAddresses,
    ] = await Promise.all([
      checkDatabaseHealth(),
      checkElasticsearchHealth(),
      checkAIProvidersHealth(),
      checkClientAddressHealth(),
    ]);

    const services = [dbHealth, esHealth, aiHealth, clientAddresses];

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
