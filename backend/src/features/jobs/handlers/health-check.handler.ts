// src/features/jobs/handlers/health-check.handler.ts

/**
 * Worker for the `health-check` queue: runs the same checks as Health
 * Monitoring (database, search engine, AI providers) and returns a summary.
 * pg-boss stores it as the job's output, which the home page reads, so the
 * dashboard shows real health without running the checks on every page load.
 * The checks are plain status requests; they spend no model tokens.
 */

/** What the home page reads from the latest completed run */
export interface HealthCheckOutput {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checkedAt: string;
  services: Array<{ name: string; status: 'healthy' | 'degraded' | 'unhealthy'; message?: string }>;
}

export async function healthCheckWorker(): Promise<HealthCheckOutput> {
  // Imported lazily so the health checks (and their clients) only load when a job runs
  const { checkSystemHealth } = await import('@/features/health/health.service');
  const health = await checkSystemHealth();
  return {
    status: health.status,
    checkedAt: health.timestamp.toISOString(),
    services: health.services.map((s) => ({ name: s.name, status: s.status, ...(s.message ? { message: s.message } : {}) })),
  };
}
