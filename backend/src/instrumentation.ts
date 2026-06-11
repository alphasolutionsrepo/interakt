// instrumentation.ts

/**
 * Next.js Instrumentation
 *
 * This file runs once when the Next.js server starts.
 * Used for initialization tasks like:
 * - Starting the analytics collector
 * - Database seeding
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on the server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dev-only: apply Drizzle migrations to both DBs before anything else
    // touches them. Production deploys are expected to run migrations
    // explicitly as a deploy step.
    const { runDevMigrations } = await import('@/shared/setup/auto-migrate');
    await runDevMigrations();

    // Initialize analytics config (feature flags) first
    const { initializeAnalyticsConfig, startAnalyticsCollector } = await import(
      '@/features/analytics'
    );
    initializeAnalyticsConfig();

    // Start analytics collector (fire-and-forget, non-blocking)
    startAnalyticsCollector({
      enabled: process.env.ENABLE_ANALYTICS !== 'false',
      flushIntervalMs: parseInt(process.env.ANALYTICS_FLUSH_INTERVAL ?? '5000', 10),
      batchSize: parseInt(process.env.ANALYTICS_BATCH_SIZE ?? '100', 10),
      logStats: process.env.NODE_ENV === 'development',
    });

    // Initialize OpenTelemetry tracing
    const { initializeTelemetryConfig, initializeTelemetry, loadTelemetryOverridesFromDB } = await import(
      '@/features/telemetry'
    );
    initializeTelemetryConfig();
    initializeTelemetry();

    // Load per-experience telemetry overrides from DB (blocking to avoid race condition
    // where early requests ignore per-experience settings)
    await loadTelemetryOverridesFromDB();

    // Initialize search providers (Elasticsearch, Azure AI Search, etc.)
    const { initializeSearchProviders } = await import(
      '@/features/search/providers'
    );
    initializeSearchProviders();

    // Register pipeline step handlers
    const { registerAllStepHandlers } = await import(
      '@/features/pipeline/steps'
    );
    registerAllStepHandlers();

    // Run seeding (AI provider catalog + prompt templates).
    // Respects ENABLE_AUTO_SEEDING env var.
    const { runStartupSeeding } = await import('@/shared/seeders');
    await runStartupSeeding();

    // Seed the admin user from setup/setup.config.yaml if no admin exists yet.
    // This is what makes `npm run dev` self-bootstrapping.
    const { seedAdminFromYaml } = await import('@/shared/setup/admin-seed');
    await seedAdminFromYaml();

    // Start the background jobs engine (pg-boss). Fire-and-forget: failures are
    // logged inside startJobs and must not block server boot. Respects
    // ENABLE_JOBS. Runs in-process; safe across multiple replicas.
    const { startJobs } = await import('@/features/jobs');
    void startJobs();
  }
}