import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const noopSpan = {
  setAttribute: vi.fn(),
  setStatus: vi.fn(),
  recordException: vi.fn(),
  addEvent: vi.fn(),
  end: vi.fn(),
};

vi.mock('@/features/telemetry/tracing-utils', () => ({
  withSpan: vi.fn((_opts, fn) => fn(noopSpan)),
}));

vi.mock('@/features/telemetry', () => ({
  ATTR: { EXPERIENCE_ID: 'experience.id' },
}));

import { executePipeline } from './orchestrator';
import {
  registerStepHandler,
  clearStepHandlers,
} from './step-registry';
import type {
  PipelineConfig,
  PipelineContext,
  PipelineStep,
  StepHandler,
  StepResult,
} from './pipeline.types';

// ============================================================================
// TEST HELPERS
// ============================================================================

function makeStep(overrides: Partial<PipelineStep> & { id: string; type: PipelineStep['type'] }): PipelineStep {
  return {
    name: overrides.id,
    description: undefined,
    config: {},
    enabled: true,
    order: 0,
    ...overrides,
  };
}

function makeConfig(steps: PipelineStep[], overrides?: Partial<PipelineConfig>): PipelineConfig {
  return {
    mode: 'deterministic',
    steps,
    settings: {
      maxTotalDurationMs: 30_000,
      enableTracing: true,
      onStepFailure: 'abort',
    },
    ...overrides,
  };
}

function makeContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    experienceId: 'exp-1',
    experienceSlug: 'test-exp',
    userMessage: 'hello',
    sessionId: 'sess-1',
    conversationHistory: [],
    resultMemory: { sets: {}, referenceIndex: [] },
    stepResults: {},
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    emitEvent: vi.fn(),
    responseText: '',
    responseMetadata: {},
    aborted: false,
    shared: {},
    ...overrides,
  };
}

function makeHandler(
  type: StepHandler['type'],
  executeFn?: StepHandler['execute'],
  fallbackFn?: StepHandler['fallback'],
): StepHandler {
  return {
    type,
    execute: executeFn ?? vi.fn().mockResolvedValue({ success: true }),
    ...(fallbackFn ? { fallback: fallbackFn } : {}),
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('executePipeline', () => {
  beforeEach(() => {
    clearStepHandlers();
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Basic execution
  // --------------------------------------------------------------------------

  it('executes enabled steps in order', async () => {
    const callOrder: string[] = [];

    registerStepHandler(makeHandler('intent_detection', async () => {
      callOrder.push('intent');
      return { success: true };
    }));
    registerStepHandler(makeHandler('validation', async () => {
      callOrder.push('validation');
      return { success: true };
    }));

    const steps = [
      makeStep({ id: 'step-2', type: 'validation', order: 2 }),
      makeStep({ id: 'step-1', type: 'intent_detection', order: 1 }),
    ];

    const ctx = makeContext();
    await executePipeline(makeConfig(steps), ctx);

    expect(callOrder).toEqual(['intent', 'validation']);
  });

  it('skips disabled steps', async () => {
    const executeFn = vi.fn().mockResolvedValue({ success: true });
    registerStepHandler(makeHandler('intent_detection', executeFn));

    const steps = [
      makeStep({ id: 'step-1', type: 'intent_detection', order: 1, enabled: false }),
    ];

    const ctx = makeContext();
    await executePipeline(makeConfig(steps), ctx);

    expect(executeFn).not.toHaveBeenCalled();
  });

  it('stores step results in context keyed by step id', async () => {
    const result: StepResult = { success: true, data: { action: 'search' } };
    registerStepHandler(makeHandler('intent_detection', vi.fn().mockResolvedValue(result)));

    const steps = [makeStep({ id: 'detect-intent', type: 'intent_detection', order: 1 })];
    const ctx = makeContext();
    await executePipeline(makeConfig(steps), ctx);

    expect(ctx.stepResults['detect-intent']).toEqual(result);
  });

  // --------------------------------------------------------------------------
  // Streaming events
  // --------------------------------------------------------------------------

  it('emits step_start and step_complete events', async () => {
    registerStepHandler(makeHandler('intent_detection'));

    const steps = [makeStep({ id: 'step-1', type: 'intent_detection', order: 1 })];
    const ctx = makeContext();
    await executePipeline(makeConfig(steps), ctx);

    const events = (ctx.emitEvent as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'step_start', stepId: 'step-1' }),
        expect.objectContaining({ type: 'step_complete', stepId: 'step-1', status: 'ok' }),
      ]),
    );
  });

  // --------------------------------------------------------------------------
  // Abort via step result
  // --------------------------------------------------------------------------

  it('stops pipeline when a step returns abort: true', async () => {
    const secondExecute = vi.fn().mockResolvedValue({ success: true });

    registerStepHandler(makeHandler('input_guardrail', async () => ({
      success: true,
      abort: true,
    })));
    registerStepHandler(makeHandler('intent_detection', secondExecute));

    const steps = [
      makeStep({ id: 'guardrail', type: 'input_guardrail', order: 1 }),
      makeStep({ id: 'intent', type: 'intent_detection', order: 2 }),
    ];

    const ctx = makeContext();
    await executePipeline(makeConfig(steps), ctx);

    expect(ctx.aborted).toBe(true);
    expect(secondExecute).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Failure strategies
  // --------------------------------------------------------------------------

  describe('failure strategy: abort (default)', () => {
    it('sets aborted and emits error event when a step throws', async () => {
      registerStepHandler(makeHandler('intent_detection', async () => {
        throw new Error('LLM failed');
      }));

      const steps = [makeStep({ id: 'step-1', type: 'intent_detection', order: 1 })];
      const ctx = makeContext();
      await executePipeline(makeConfig(steps), ctx);

      expect(ctx.aborted).toBe(true);
      const events = (ctx.emitEvent as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'error', message: 'LLM failed', stepId: 'step-1' }),
        ]),
      );
    });
  });

  describe('failure strategy: skip', () => {
    it('continues to next step when a step fails with skip strategy', async () => {
      const secondExecute = vi.fn().mockResolvedValue({ success: true });

      registerStepHandler(makeHandler('intent_detection', async () => {
        throw new Error('oops');
      }));
      registerStepHandler(makeHandler('validation', secondExecute));

      const steps = [
        makeStep({ id: 'step-1', type: 'intent_detection', order: 1, onFailure: 'skip' }),
        makeStep({ id: 'step-2', type: 'validation', order: 2 }),
      ];

      const ctx = makeContext();
      await executePipeline(makeConfig(steps), ctx);

      expect(ctx.aborted).toBe(false);
      expect(secondExecute).toHaveBeenCalled();
      expect(ctx.stepResults['step-1']?.success).toBe(false);
    });
  });

  describe('failure strategy: fallback', () => {
    it('calls fallback handler when step fails and fallback exists', async () => {
      const fallbackResult: StepResult = { success: true, data: { fallback: true } };
      registerStepHandler(makeHandler(
        'intent_detection',
        async () => { throw new Error('primary failed'); },
        vi.fn().mockResolvedValue(fallbackResult),
      ));

      const steps = [
        makeStep({ id: 'step-1', type: 'intent_detection', order: 1, onFailure: 'fallback' }),
      ];

      const ctx = makeContext();
      await executePipeline(makeConfig(steps), ctx);

      expect(ctx.aborted).toBe(false);
      expect(ctx.stepResults['step-1']).toEqual(fallbackResult);

      const events = (ctx.emitEvent as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'step_complete', stepId: 'step-1', status: 'fallback' }),
        ]),
      );
    });

    it('uses fallbackConfig when provided', async () => {
      const fallbackFn = vi.fn().mockResolvedValue({ success: true });
      registerStepHandler(makeHandler(
        'intent_detection',
        async () => { throw new Error('fail'); },
        fallbackFn,
      ));

      const fallbackConfig = { model: 'gpt-4o-mini' };
      const steps = [
        makeStep({
          id: 'step-1',
          type: 'intent_detection',
          order: 1,
          onFailure: 'fallback',
          fallbackConfig,
        }),
      ];

      const ctx = makeContext();
      await executePipeline(makeConfig(steps), ctx);

      expect(fallbackFn).toHaveBeenCalledWith(
        fallbackConfig,
        expect.anything(),
        expect.any(Error),
      );
    });

    it('treats as skip when no fallback handler exists', async () => {
      registerStepHandler(makeHandler('intent_detection', async () => {
        throw new Error('fail');
      }));

      const steps = [
        makeStep({ id: 'step-1', type: 'intent_detection', order: 1, onFailure: 'fallback' }),
      ];

      const ctx = makeContext();
      await executePipeline(makeConfig(steps), ctx);

      expect(ctx.aborted).toBe(false);
      expect(ctx.stepResults['step-1']?.success).toBe(false);
    });

    it('aborts when fallback itself throws', async () => {
      registerStepHandler(makeHandler(
        'intent_detection',
        async () => { throw new Error('primary'); },
        async () => { throw new Error('fallback also broke'); },
      ));

      const steps = [
        makeStep({ id: 'step-1', type: 'intent_detection', order: 1, onFailure: 'fallback' }),
      ];

      const ctx = makeContext();
      await executePipeline(makeConfig(steps), ctx);

      expect(ctx.aborted).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Conditions
  // --------------------------------------------------------------------------

  describe('step conditions', () => {
    it('skips step when eq condition fails', async () => {
      const executeFn = vi.fn().mockResolvedValue({ success: true });
      registerStepHandler(makeHandler('validation', executeFn));

      const steps = [
        makeStep({
          id: 'step-1',
          type: 'validation',
          order: 1,
          conditions: [{ field: 'shared.mode', operator: 'eq', value: 'advanced' }],
        }),
      ];

      const ctx = makeContext({ shared: { mode: 'basic' } });
      await executePipeline(makeConfig(steps), ctx);

      expect(executeFn).not.toHaveBeenCalled();
    });

    it('runs step when eq condition passes', async () => {
      const executeFn = vi.fn().mockResolvedValue({ success: true });
      registerStepHandler(makeHandler('validation', executeFn));

      const steps = [
        makeStep({
          id: 'step-1',
          type: 'validation',
          order: 1,
          conditions: [{ field: 'shared.mode', operator: 'eq', value: 'advanced' }],
        }),
      ];

      const ctx = makeContext({ shared: { mode: 'advanced' } });
      await executePipeline(makeConfig(steps), ctx);

      expect(executeFn).toHaveBeenCalled();
    });

    it('evaluates neq condition', async () => {
      const executeFn = vi.fn().mockResolvedValue({ success: true });
      registerStepHandler(makeHandler('validation', executeFn));

      const steps = [
        makeStep({
          id: 'step-1',
          type: 'validation',
          order: 1,
          conditions: [{ field: 'shared.mode', operator: 'neq', value: 'skip' }],
        }),
      ];

      const ctx = makeContext({ shared: { mode: 'run' } });
      await executePipeline(makeConfig(steps), ctx);

      expect(executeFn).toHaveBeenCalled();
    });

    it('evaluates exists condition on nested dot path', async () => {
      const executeFn = vi.fn().mockResolvedValue({ success: true });
      registerStepHandler(makeHandler('tool_execution', executeFn));

      registerStepHandler(makeHandler('intent_detection', async () => ({
        success: true,
        data: { action: 'search' },
      })));

      const steps = [
        makeStep({ id: 'intent', type: 'intent_detection', order: 1 }),
        makeStep({
          id: 'tool',
          type: 'tool_execution',
          order: 2,
          conditions: [{ field: 'stepResults.intent.data.action', operator: 'exists', value: null }],
        }),
      ];

      const ctx = makeContext();
      await executePipeline(makeConfig(steps), ctx);

      expect(executeFn).toHaveBeenCalled();
    });

    it('evaluates in condition', async () => {
      const executeFn = vi.fn().mockResolvedValue({ success: true });
      registerStepHandler(makeHandler('tool_execution', executeFn));

      const steps = [
        makeStep({
          id: 'step-1',
          type: 'tool_execution',
          order: 1,
          conditions: [{ field: 'shared.intent', operator: 'in', value: ['search', 'compare'] }],
        }),
      ];

      const ctx = makeContext({ shared: { intent: 'search' } });
      await executePipeline(makeConfig(steps), ctx);

      expect(executeFn).toHaveBeenCalled();
    });

    it('requires ALL conditions to pass', async () => {
      const executeFn = vi.fn().mockResolvedValue({ success: true });
      registerStepHandler(makeHandler('validation', executeFn));

      const steps = [
        makeStep({
          id: 'step-1',
          type: 'validation',
          order: 1,
          conditions: [
            { field: 'shared.a', operator: 'eq', value: true },
            { field: 'shared.b', operator: 'eq', value: true },
          ],
        }),
      ];

      // Only one condition true
      const ctx = makeContext({ shared: { a: true, b: false } });
      await executePipeline(makeConfig(steps), ctx);

      expect(executeFn).not.toHaveBeenCalled();
    });

    it('evaluates gt and lt conditions', async () => {
      const executeFn = vi.fn().mockResolvedValue({ success: true });
      registerStepHandler(makeHandler('validation', executeFn));

      const steps = [
        makeStep({
          id: 'step-1',
          type: 'validation',
          order: 1,
          conditions: [
            { field: 'shared.score', operator: 'gt', value: 0.5 },
            { field: 'shared.score', operator: 'lt', value: 1.0 },
          ],
        }),
      ];

      const ctx = makeContext({ shared: { score: 0.8 } });
      await executePipeline(makeConfig(steps), ctx);

      expect(executeFn).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Timeout
  // --------------------------------------------------------------------------

  it('aborts pipeline when timeout is exceeded', async () => {
    registerStepHandler(makeHandler('intent_detection', async () => {
      // Simulate slow step
      await new Promise((r) => setTimeout(r, 50));
      return { success: true };
    }));
    registerStepHandler(makeHandler('validation', vi.fn().mockResolvedValue({ success: true })));

    const steps = [
      makeStep({ id: 'step-1', type: 'intent_detection', order: 1 }),
      makeStep({ id: 'step-2', type: 'validation', order: 2 }),
    ];

    const config = makeConfig(steps, {
      settings: { maxTotalDurationMs: 10, enableTracing: true, onStepFailure: 'abort' },
    });

    const ctx = makeContext();
    await executePipeline(config, ctx);

    expect(ctx.aborted).toBe(true);
    const events = (ctx.emitEvent as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'error', message: 'Pipeline execution timed out' }),
      ]),
    );
  });
});
