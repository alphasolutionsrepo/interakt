// src/features/telemetry/telemetry.init.test.ts

/**
 * initializeTelemetry() loads the OpenTelemetry SDK with `await import()` (the packages may load
 * as ES modules, which require() can't return synchronously), sets up one tracer provider, and
 * shares one initialization between calls that overlap.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const otel = vi.hoisted(() => ({
  enabled: true,
  failOnRegister: false,
  register: vi.fn(),
  providers: 0,
}));

vi.mock('./telemetry.config', () => ({
  getTelemetryConfig: () => ({
    enabled: otel.enabled,
    serviceName: 'test-service',
    serviceVersion: '0.0.0',
    environment: 'test',
    exporterType: 'postgres',
    batchConfig: { maxQueueSize: 10, maxExportBatchSize: 5, scheduledDelayMillis: 100, exportTimeoutMillis: 100 },
  }),
}));
vi.mock('@opentelemetry/sdk-trace-node', () => ({
  NodeTracerProvider: class {
    constructor() { otel.providers += 1; }
    register() {
      if (otel.failOnRegister) throw new Error('register failed');
      otel.register();
    }
  },
}));
vi.mock('@opentelemetry/sdk-trace-base', () => ({ BatchSpanProcessor: class {} }));
vi.mock('@opentelemetry/resources', () => ({ resourceFromAttributes: () => ({}) }));
vi.mock('./postgres-span-exporter', () => ({ PostgresSpanExporter: class {} }));
vi.mock('./content-policy', () => ({ ContentPolicyProcessor: class {} }));

const GLOBAL_KEYS = ['__alpha_otel_provider__', '__alpha_otel_initialized__', '__alpha_otel_initializing__'];
const resetGlobals = () => {
  for (const key of GLOBAL_KEYS) delete (globalThis as Record<string, unknown>)[key];
};

beforeEach(() => {
  resetGlobals();
  otel.enabled = true;
  otel.failOnRegister = false;
  otel.providers = 0;
  otel.register.mockClear();
});
afterEach(resetGlobals);

describe('initializeTelemetry', () => {
  it('sets up and registers one tracer provider', async () => {
    const { initializeTelemetry } = await import('./telemetry.init');
    await initializeTelemetry();
    expect(otel.providers).toBe(1);
    expect(otel.register).toHaveBeenCalledTimes(1);
  });

  it('shares one initialization between overlapping calls', async () => {
    const { initializeTelemetry } = await import('./telemetry.init');
    const first = initializeTelemetry();
    const second = initializeTelemetry();
    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(otel.providers).toBe(1);
    expect(otel.register).toHaveBeenCalledTimes(1);
  });

  it('does nothing more once initialized', async () => {
    const { initializeTelemetry } = await import('./telemetry.init');
    await initializeTelemetry();
    await initializeTelemetry();
    expect(otel.providers).toBe(1);
  });

  it('sets up no provider when telemetry is off', async () => {
    otel.enabled = false;
    const { initializeTelemetry } = await import('./telemetry.init');
    await initializeTelemetry();
    expect(otel.providers).toBe(0);
    expect(otel.register).not.toHaveBeenCalled();
  });

  it('resolves when setup fails, and does not retry', async () => {
    otel.failOnRegister = true;
    const { initializeTelemetry } = await import('./telemetry.init');
    await expect(initializeTelemetry()).resolves.toBeUndefined();
    otel.failOnRegister = false;
    await initializeTelemetry();
    expect(otel.providers).toBe(1);
  });
});
