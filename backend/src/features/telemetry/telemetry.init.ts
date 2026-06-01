// src/features/telemetry/telemetry.init.ts

/**
 * OpenTelemetry SDK Initialization
 *
 * Sets up TracerProvider with BatchSpanProcessor and PostgresSpanExporter.
 * Called once from instrumentation.ts. Idempotent.
 */

import { createLogger } from '@/shared/logger/logger';
import { getTelemetryConfig } from './telemetry.config';

const logger = createLogger('telemetry-init');

// Use globalThis to survive Next.js module re-evaluation (HMR / Turbopack).
// Without this, module-level variables reset to null on re-evaluation while
// the OTel SDK remains registered globally, causing flushTelemetry() to no-op.
const PROVIDER_KEY = '__alpha_otel_provider__' as const;
const INITIALIZED_KEY = '__alpha_otel_initialized__' as const;

function getProvider(): unknown {
  return (globalThis as Record<string, unknown>)[PROVIDER_KEY] ?? null;
}
function setProvider(p: unknown): void {
  (globalThis as Record<string, unknown>)[PROVIDER_KEY] = p;
}
function isAlreadyInitialized(): boolean {
  return (globalThis as Record<string, unknown>)[INITIALIZED_KEY] === true;
}
function markInitialized(): void {
  (globalThis as Record<string, unknown>)[INITIALIZED_KEY] = true;
}

/**
 * Initialize the OpenTelemetry SDK.
 * Safe to call multiple times (idempotent).
 */
export function initializeTelemetry(): void {
  if (isAlreadyInitialized()) {
    logger.warn('Telemetry already initialized');
    return;
  }

  const config = getTelemetryConfig();

  if (!config.enabled) {
    logger.info('Telemetry disabled (ENABLE_OTEL != true), skipping initialization');
    markInitialized();
    return;
  }

  try {
    // Dynamic imports to avoid loading OTel SDK when disabled
    const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
    const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
    const { resourceFromAttributes } = require('@opentelemetry/resources');
    const {
      ATTR_SERVICE_NAME,
      ATTR_SERVICE_VERSION,
    } = require('@opentelemetry/semantic-conventions');

    const { PostgresSpanExporter } = require('./postgres-span-exporter');

    // Create resource describing this service (v2 API: resourceFromAttributes)
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion,
      'deployment.environment': config.environment,
    });

    // Create exporter and processor
    const exporter = new PostgresSpanExporter();
    const batchProcessor = new BatchSpanProcessor(exporter, {
      maxQueueSize: config.batchConfig.maxQueueSize,
      maxExportBatchSize: config.batchConfig.maxExportBatchSize,
      scheduledDelayMillis: config.batchConfig.scheduledDelayMillis,
      exportTimeoutMillis: config.batchConfig.exportTimeoutMillis,
    });

    // Create provider with span processors (v2 API: passed in constructor)
    const p = new NodeTracerProvider({
      resource,
      spanProcessors: [batchProcessor],
    });

    // Register as the global tracer provider
    p.register();
    setProvider(p);
    markInitialized();

    logger.info('OpenTelemetry initialized', {
      serviceName: config.serviceName,
      exporter: config.exporterType,
      batchSize: config.batchConfig.maxExportBatchSize,
      batchDelayMs: config.batchConfig.scheduledDelayMillis,
    });
  } catch (error) {
    logger.error('Failed to initialize OpenTelemetry', error as Error);
    markInitialized(); // Mark as initialized to avoid retry loops
  }
}

/**
 * Flush all pending spans without shutting down the provider.
 *
 * Must be called at the end of every request handler in serverless environments
 * (e.g. Vercel) where the runtime freezes immediately after the response is sent.
 * The BatchSpanProcessor's background flush timer will never fire in that window,
 * so without an explicit flush, spans are silently dropped.
 *
 * Safe to call repeatedly — it's a no-op when telemetry is disabled or no spans
 * are buffered. Typically completes in < 100ms (single DB insert).
 */
export async function flushTelemetry(): Promise<void> {
  const p = getProvider() as { forceFlush(): Promise<void> } | null;
  if (!p) return;

  try {
    await p.forceFlush();
  } catch (error) {
    // Log but never throw — telemetry flush must not break the response
    logger.error('Failed to flush telemetry spans', error as Error);
  }
}

/**
 * Gracefully shut down the telemetry system.
 * Flushes all pending spans before returning.
 */
export async function shutdownTelemetry(): Promise<void> {
  const p = getProvider() as { shutdown(): Promise<void> } | null;
  if (!p) return;

  try {
    await p.shutdown();
    logger.info('Telemetry shut down, all pending spans flushed');
  } catch (error) {
    logger.error('Error shutting down telemetry', error as Error);
  }
}
