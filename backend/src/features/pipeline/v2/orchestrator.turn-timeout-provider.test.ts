// src/features/pipeline/v2/orchestrator.turn-timeout-provider.test.ts

/**
 * A turn that runs out of time while its model call is still waiting on the provider stops
 * that call as timed out: the provider didn't answer in time, so the AI service records a
 * failed call and the circuit breaker counts it, as when the call's own timeout fires. The
 * turn still ends as timed out, not as failing, with no further attempt of the call. A
 * visitor leaving stops the call as cancelled, which is not the provider failing.
 *
 * Runs the real orchestrator, AI service and Ollama adapter; only the network, the
 * provider lookup and the usage store are faked.
 */

import { trace } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/shared/logger/logger', () => ({ createLogger: () => log }));
vi.mock('@/features/telemetry/telemetry.config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/telemetry/telemetry.config')>()),
  isTelemetryEnabled: () => true,
}));
vi.mock('@/features/prompt-templates', () => ({
  resolveTemplate: vi.fn().mockResolvedValue(null),
  renderTemplate: vi.fn((content: string) => content),
}));
const usage = vi.hoisted(() => ({ trackUsage: vi.fn(), updateRealtimeMetrics: vi.fn() }));
vi.mock('@/features/ai-service/ai-service.analytics', () => usage);
vi.mock('@/features/ai-providers/ai-providers.service', () => ({
  getProviderConfigById: async () => ({ id: 'p1', providerKey: 'ollama', isEnabled: true, baseUrl: 'http://model.test', settings: {} }),
  getModelById: async () => ({ id: 1, modelKey: 'qwen2.5:14b', capabilities: {} }),
  getProviderByKey: vi.fn(),
  getResolvedDefaults: vi.fn(),
}));

import { TurnAbandonedError } from '../turn-abandoned';

import { runV2Pipeline } from './orchestrator';
import type { V2PipelineDeps, V2PipelineInput } from './orchestrator';

import { getCircuitStatus, resetCircuit } from '@/features/ai-service/ai-service.resilience';
import { chat } from '@/features/ai-service/ai-service.service';
import { ATTR } from '@/features/telemetry/attribute-keys';

const exporter = new InMemorySpanExporter();
trace.setGlobalTracerProvider(new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }));

/** A provider that never answers: the request ends only when aborted, with the abort's reason, as fetch does */
const hangingModel = vi.fn((_url: string, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  }),
);

const experience: V2PipelineInput['experience'] = {
  id: 'exp-1', slug: 'test-exp', providerId: 'p1', modelId: 1,
  personaConfig: { systemInstructions: 'Be helpful.', businessDomains: ['E-commerce'], tone: 'friendly', name: 'TestBot' },
  sessionConfig: { maxContextMessages: 6 },
  tools: [],
};

function makeDeps(): V2PipelineDeps {
  return {
    contextAssembly: {
      sessionLoader: {
        getSessionWithWindow: vi.fn().mockResolvedValue({
          session: { id: 'session-1', summary: null, facts: null, pipelineState: null, userContext: null, messageCount: 0, status: 'active' },
          messages: [],
        }),
        createSession: vi.fn(),
      },
      episodicMemoryLoader: { retrieveRelevantMemories: vi.fn().mockResolvedValue([]) },
    },
    turnPlanner: { chat },
    executionLoop: { chat, executeTool: vi.fn() },
    synthesis: { chat },
    persistence: { addMessages: vi.fn(), updateSession: vi.fn(), discardEmptySession: vi.fn() },
  };
}

/** The turn's span once its work has stopped */
const turnSpan = async () => {
  await vi.waitFor(() => expect(exporter.getFinishedSpans().map((s) => s.name)).toContain('pipeline.v2.turn'));
  return exporter.getFinishedSpans().find((s) => s.name === 'pipeline.v2.turn')!;
};

beforeEach(() => {
  vi.clearAllMocks();
  exporter.reset();
  resetCircuit('p1');
  vi.stubGlobal('fetch', hangingModel);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a turn that runs out of time while the model has not answered', () => {
  it('records the call as failed, not counted against the provider\'s circuit, and ends the turn as timed out', async () => {
    const onEvent = vi.fn();

    const result = await runV2Pipeline({ experience, message: 'Search for red shoes', sessionId: 'session-1', onEvent }, makeDeps(), { maxTotalDurationMs: 50 });

    expect(result.responseText).toBe('');
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', code: 'TURN_TIMEOUT' }));
    const turn = await turnSpan();
    expect(turn.attributes['alpha.v2.outcome']).toBe('timed_out');
    expect(turn.attributes[ATTR.TURN_ABANDONED]).toBe('the turn-planner call finished');

    expect(hangingModel).toHaveBeenCalledOnce(); // not tried again after the turn's time ran out
    expect(usage.trackUsage).toHaveBeenCalledOnce();
    expect(usage.trackUsage.mock.calls[0][0]).toMatchObject({ operation: 'chat', feature: 'turn-planner', success: false, errorMessage: "Request stopped: the caller's time ran out" });
    // The turn's time may have gone on other steps: not the provider failing
    expect(getCircuitStatus('p1')).toMatchObject({ failures: 0 });
    // Logged once, as the turn timing out: the stopped turn isn't a failure of its own
    expect(log.warn.mock.calls.map(([message]) => message)).toEqual(['V2 pipeline timed out — returning graceful response']);
    expect(log.error).not.toHaveBeenCalled();
  });
});

describe('a visitor who leaves while the model has not answered', () => {
  it('records the call as cancelled, not as the provider failing', async () => {
    const visitor = new AbortController();

    const turn = runV2Pipeline({ experience, message: 'Search for red shoes', sessionId: 'session-1', onEvent: vi.fn(), signal: visitor.signal }, makeDeps(), { maxTotalDurationMs: 60_000 });
    await vi.waitFor(() => expect(hangingModel).toHaveBeenCalled());
    visitor.abort();

    await expect(turn).rejects.toBeInstanceOf(TurnAbandonedError);
    expect(hangingModel).toHaveBeenCalledOnce();
    expect(usage.trackUsage).toHaveBeenCalledOnce();
    expect(usage.trackUsage.mock.calls[0][0]).toMatchObject({ success: true, metadata: { cancelled: true } });
    expect(getCircuitStatus('p1')).toMatchObject({ failures: 0 });
    expect(log.error).not.toHaveBeenCalled();
  });
});
