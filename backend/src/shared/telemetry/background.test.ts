// src/shared/telemetry/background.test.ts

/**
 * Background work (flushes, sweeps, the span exporter, the jobs engine) is often started
 * by whichever request needs it first. A timer runs in the trace it was created in, so
 * it must be created outside that request's trace: otherwise every later tick, and
 * every log line it writes, is linked to a request that ended long ago.
 *
 * Each test starts the work inside a request span and records the trace that is active
 * where the work will run (where its timer is created, where pg-boss starts, where the
 * exporter logs). That is the trace its later ticks run in.
 */

import { trace } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterEach, describe, expect, it, vi } from 'vitest';

const activeTrace = () => trace.getActiveSpan()?.spanContext().traceId;
const recorded: Array<string | undefined> = [];
// Whether a span started here would be recorded (false while tracing is suppressed)
const tracedHere: boolean[] = [];

vi.mock('@/db/index', () => ({ analyticsDB: null }));
vi.mock('@/config', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/config')>();
    return { ...real, databaseConfig: { ...real.databaseConfig, connection: { ...real.databaseConfig.connection, url: 'postgres://jobs-test' } } };
});
vi.mock('pg-boss', () => ({
    PgBoss: class {
        on() {}
        async start() { recorded.push(activeTrace()); }
        async createQueue() {}
        async updateQueue() {}
        async work() {}
        async getQueue() { return null; }
        async getSchedules() { return []; }
        async schedule() {}
        async stop() {}
    },
}));
vi.mock('@/shared/logger/logger', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/shared/logger/logger')>();
    const record = () => {
        recorded.push(activeTrace());
        tracedHere.push(trace.getTracer('probe').startSpan('probe').isRecording());
    };
    const logger = { debug() {}, info() {}, warn: record, error: record, child: () => logger };
    return { ...real, createLogger: () => logger };
});

import { startAnalyticsCollector, stopAnalyticsCollector, trackSearch } from '@/features/analytics/analytics-collector';
import { stopRetentionCleanup } from '@/features/analytics/analytics-retention';
import { TopicGateCache } from '@/features/guardrails/topic-gate.cache';
import { ensureJobsStarted } from '@/features/jobs/jobs.boot';
import { FacetCache } from '@/features/pipeline/v2/facet-cache';
import { PostgresSpanExporter } from '@/features/telemetry/postgres-span-exporter';
import { CacheManager } from '@/shared/cache/cache-manager';

const provider = new NodeTracerProvider();
provider.register();

/** Run work inside a request span; returns that request's trace id */
function inRequest(work: () => unknown): Promise<string> {
    return provider.getTracer('test').startActiveSpan('POST /api/v1/chat', async (span) => {
        await work();
        span.end();
        return span.spanContext().traceId;
    });
}

/** Record the trace active wherever a timer is created, while work runs */
function recordTimers(): void {
    for (const name of ['setInterval', 'setTimeout', 'setImmediate'] as const) {
        const real = globalThis[name] as (...args: unknown[]) => unknown;
        vi.spyOn(globalThis, name).mockImplementation(((...args: unknown[]) => {
            recorded.push(activeTrace());
            return real(...args);
        }) as never);
    }
}

afterEach(async () => {
    vi.restoreAllMocks();
    recorded.length = 0;
    tracedHere.length = 0;
});

describe('background work started by a request runs outside its trace', () => {
    it.each([
        ['the topic-gate cache sweep', () => new TopicGateCache()],
        ['the facet cache sweep', () => new FacetCache({ sweepIntervalMs: 60_000 }).startSweepTimer()],
        ['a cache manager cleanup', () => new CacheManager('background-test')],
    ])('%s', async (_what, start) => {
        recordTimers();
        const requestTrace = await inRequest(start);
        expect(requestTrace).toMatch(/^[0-9a-f]{32}$/);
        expect(recorded.length).toBeGreaterThan(0);
        expect(recorded.every((t) => t === undefined)).toBe(true);
    });

    it('the analytics collector, its flush and its retention cleanup', async () => {
        recordTimers();
        await inRequest(() => {
            startAnalyticsCollector({ enabled: true, batchSize: 1 });
            trackSearch({
                requestId: 'r1', triggerType: 'user', searchType: 'lexical', indexIds: ['i1'], queryText: 'linen',
                totalResults: 0, resultsReturned: 0, durationMs: 1, success: true,
            } as Parameters<typeof trackSearch>[0]);
        });
        await stopAnalyticsCollector();
        stopRetentionCleanup();
        expect(recorded.length).toBeGreaterThanOrEqual(3);
        expect(recorded.every((t) => t === undefined)).toBe(true);
    });

    it('the jobs engine, started by an admin request when it failed at boot', async () => {
        await inRequest(() => ensureJobsStarted());
        expect(recorded).toEqual([undefined]);
    });

    it("the span exporter's log lines, which OpenTelemetry's batch timer runs in the span that ended first", async () => {
        const span = { name: 'search.query', attributes: {}, instrumentationScope: { name: 'interakt' } } as unknown as ReadableSpan;
        const exported = new Promise((resolve) => {
            void inRequest(() => new PostgresSpanExporter().export([span], resolve));
        });
        expect(await exported).toEqual({ code: 0 }); // ExportResultCode.SUCCESS
        expect(recorded).toEqual([undefined]);
        // and it still traces nothing while it writes, so its own writes are never exported
        expect(tracedHere).toEqual([false]);
    });
});
