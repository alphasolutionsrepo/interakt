// src/features/pipeline/v2/planning-loop.test.ts

/**
 * Acceptance harness for the bounded planning loop.
 *
 * These are the tests that make consolidating two chat engines into one safe.
 * They assert *what the engine did* — how many planning rounds ran, which tools
 * were called, what reached the planner prompt, what synthesis was given — not
 * the model's prose. That keeps them deterministic and provider-independent.
 *
 * The first block is the regression lock: a Governed policy must behave exactly
 * as the old deterministic engine did, one planning round and no re-planning,
 * whatever the outcome of that round.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// Every phase reaches resolveTemplate() (a DB query); force the inline-prompt
// fallback so these stay DB-free.
vi.mock('@/features/prompt-templates', () => ({
  resolveTemplate: vi.fn().mockResolvedValue(null),
  renderTemplate: vi.fn((content: string) => content),
}));

import { runV2Pipeline } from './orchestrator';
import type { V2PipelineInput, V2PipelineDeps } from './orchestrator';
import { GOVERNED_POLICY, AUTONOMOUS_POLICY } from '@/features/ai-experience/execution-policy';
import type { ExecutionPolicy } from '@/features/ai-experience/execution-policy';
import type { PipelineStreamEvent } from '../pipeline.types';
import type { ChatResult } from '@/features/ai-service/ai-service.types';

// ============================================================================
// FIXTURES
// ============================================================================

function chatResult(content: string): ChatResult {
  return {
    message: { role: 'assistant', content },
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    finishReason: 'stop',
    metadata: { requestId: 'r1', providerId: 'p1', providerKey: 'openai', modelId: 1, modelKey: 'gpt-4o', durationMs: 5 },
  };
}

/** A planner response naming one tool. */
function planFor(toolSlug: string, intent: string, query: string) {
  return chatResult(JSON.stringify({
    actions: [{ toolSlug, intent, hints: JSON.stringify({ query }), dependsOnPrevious: false }],
    reasoning: intent,
    directResponse: false,
    needsClarification: false,
    clarificationQuestion: null,
    confidence: 0.9,
  }));
}

function directResponsePlan() {
  return chatResult(JSON.stringify({
    actions: [],
    reasoning: 'greeting',
    directResponse: true,
    needsClarification: false,
    clarificationQuestion: null,
    confidence: 0.99,
  }));
}

function makeExperience(toolSlugs = ['content-search', 'content-values']): V2PipelineInput['experience'] {
  return {
    id: 'exp-1',
    slug: 'test-exp',
    providerId: 'p1',
    modelId: 1,
    personaConfig: {
      systemInstructions: 'Always search before answering. Never enumerate to answer a topic question.',
      businessDomains: ['Content'],
      tone: 'professional',
      name: 'TestBot',
      responseFormats: { enabledPresets: ['rich_text'], defaultPreset: 'rich_text' },
    },
    sessionConfig: { maxContextMessages: 6 },
    tools: toolSlugs.map((slug, i) => ({
      isEnabled: true,
      overrideAiDescription: null,
      tool: {
        id: `tool-${i + 1}`,
        name: slug,
        slug,
        executorType: 'data_source',
        operation: slug.endsWith('values') ? 'enumerate' : 'search',
        aiDescription: `Tool ${slug}`,
        inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'q' } }, required: [] },
        isActive: true,
        // Null so parameter-context enrichment short-circuits without a DB call.
        dataSourceId: null,
        displayConfig: null,
      },
    })),
  };
}

function makeInput(overrides: Partial<V2PipelineInput> = {}): V2PipelineInput {
  return {
    experience: makeExperience(),
    message: 'Who writes about plasma therapies?',
    sessionId: 'session-1',
    onEvent: vi.fn(),
    ...overrides,
  };
}

interface Scenario {
  /** Planner responses, one per round. */
  plans: ChatResult[];
  /** Tool outcomes, one per executeTool call. */
  toolResults: Array<{ success: boolean; data: unknown; resultCount?: number; error?: string }>;
  synthesisText?: string;
}

function makeDeps(scenario: Scenario) {
  const plannerChat = vi.fn();
  for (const plan of scenario.plans) plannerChat.mockResolvedValueOnce(plan);
  // Any further planning calls beyond the script would be a bug — make it loud.
  plannerChat.mockRejectedValue(new Error('planner called more times than the scenario scripted'));

  // Parameter extraction always echoes a usable query.
  const extractorChat = vi.fn().mockResolvedValue(chatResult(JSON.stringify({ query: 'plasma therapies' })));
  const synthesisChat = vi.fn().mockResolvedValue(chatResult(scenario.synthesisText ?? 'Here is what I found.'));

  const executeTool = vi.fn();
  for (const r of scenario.toolResults) executeTool.mockResolvedValueOnce(r);
  executeTool.mockResolvedValue({ success: true, data: { results: [] }, resultCount: 0 });

  const deps: V2PipelineDeps = {
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
    turnPlanner: { chat: plannerChat },
    executionLoop: { chat: extractorChat, executeTool },
    synthesis: { chat: synthesisChat },
    persistence: {
      addMessages: vi.fn().mockResolvedValue(undefined),
      updateSession: vi.fn().mockResolvedValue(undefined),
    },
  };

  return { deps, plannerChat, extractorChat, synthesisChat, executeTool };
}

const EMPTY_RESULT = { success: true, data: { results: [] }, resultCount: 0 };
const GOOD_RESULT = { success: true, data: { results: [{ id: 'a' }, { id: 'b' }] }, resultCount: 2 };
const FAILED_RESULT = { success: false, data: null, error: 'HTTP 400: sorting option not configured' };

function policy(overrides: Partial<ExecutionPolicy> = {}): ExecutionPolicy {
  return { ...AUTONOMOUS_POLICY, ...overrides };
}

/** Planner system+user prompts for a given call index. */
function promptsAt(plannerChat: ReturnType<typeof vi.fn>, index: number) {
  const messages = plannerChat.mock.calls[index][0] as Array<{ role: string; content: string }>;
  return {
    system: messages.find((m) => m.role === 'system')?.content ?? '',
    user: messages.find((m) => m.role === 'user')?.content ?? '',
  };
}

// ============================================================================
// GOVERNED — the regression lock on existing behavior
// ============================================================================

describe('Governed policy', () => {
  it('plans exactly once when the round succeeds', async () => {
    const { deps, plannerChat } = makeDeps({ plans: [planFor('content-search', 'search', 'plasma')], toolResults: [GOOD_RESULT] });
    await runV2Pipeline(makeInput(), deps, { policy: GOVERNED_POLICY });
    expect(plannerChat).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-plan when the round returns nothing', async () => {
    // The defining guarantee of Governed: one process, every time. A second
    // planning call here would mean an existing deployment silently gained
    // autonomy on upgrade.
    const { deps, plannerChat } = makeDeps({ plans: [planFor('content-search', 'search', 'plasma')], toolResults: [EMPTY_RESULT] });
    await runV2Pipeline(makeInput(), deps, { policy: GOVERNED_POLICY });
    expect(plannerChat).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-plan when the round fails outright', async () => {
    const { deps, plannerChat } = makeDeps({ plans: [planFor('content-search', 'search', 'plasma')], toolResults: [FAILED_RESULT] });
    await runV2Pipeline(makeInput(), deps, { policy: GOVERNED_POLICY });
    expect(plannerChat).toHaveBeenCalledTimes(1);
  });

  it('still synthesises a response after an empty round', async () => {
    const { deps, synthesisChat } = makeDeps({
      plans: [planFor('content-search', 'search', 'plasma')],
      toolResults: [EMPTY_RESULT],
      synthesisText: 'I could not find anything on that.',
    });
    const result = await runV2Pipeline(makeInput(), deps, { policy: GOVERNED_POLICY });
    expect(synthesisChat).toHaveBeenCalledTimes(1);
    expect(result.responseText).toBe('I could not find anything on that.');
  });

  it('omits persona instructions from the planning prompt by default', async () => {
    const { deps, plannerChat } = makeDeps({ plans: [planFor('content-search', 'search', 'plasma')], toolResults: [GOOD_RESULT] });
    await runV2Pipeline(makeInput(), deps, { policy: GOVERNED_POLICY });
    expect(promptsAt(plannerChat, 0).system).not.toContain('Always search before answering');
  });
});

// ============================================================================
// AUTONOMOUS — bounded re-planning
// ============================================================================

describe('Autonomous policy', () => {
  it('re-plans when the first round returns nothing', async () => {
    const { deps, plannerChat } = makeDeps({
      plans: [planFor('content-values', 'list authors', 'author'), planFor('content-search', 'search topic', 'plasma')],
      toolResults: [EMPTY_RESULT, GOOD_RESULT],
    });
    await runV2Pipeline(makeInput(), deps, { policy: policy() });
    expect(plannerChat).toHaveBeenCalledTimes(2);
  });

  it('re-plans when every action in a round failed', async () => {
    const { deps, plannerChat } = makeDeps({
      plans: [planFor('content-search', 'sorted search', 'plasma'), planFor('content-search', 'unsorted search', 'plasma')],
      toolResults: [FAILED_RESULT, GOOD_RESULT],
    });
    await runV2Pipeline(makeInput(), deps, { policy: policy() });
    expect(plannerChat).toHaveBeenCalledTimes(2);
  });

  it('stops as soon as a round is usable rather than spending the whole budget', async () => {
    const { deps, plannerChat } = makeDeps({
      plans: [planFor('content-search', 'search', 'plasma')],
      toolResults: [GOOD_RESULT],
    });
    await runV2Pipeline(makeInput(), deps, { policy: policy({ maxPlanningRounds: 3 }) });
    expect(plannerChat).toHaveBeenCalledTimes(1);
  });

  it('never exceeds maxPlanningRounds', async () => {
    const { deps, plannerChat, executeTool } = makeDeps({
      plans: [
        planFor('content-search', 'try one', 'a'),
        planFor('content-search', 'try two', 'b'),
      ],
      toolResults: [EMPTY_RESULT, EMPTY_RESULT],
    });
    await runV2Pipeline(makeInput(), deps, { policy: policy({ maxPlanningRounds: 2 }) });
    expect(plannerChat).toHaveBeenCalledTimes(2);
    expect(executeTool).toHaveBeenCalledTimes(2);
  });

  it('enforces the tool-call ceiling across rounds, not per round', async () => {
    // Two rounds are permitted, but the ceiling allows only one tool call in
    // total — so the second round must never execute.
    const { deps, executeTool } = makeDeps({
      plans: [planFor('content-search', 'try one', 'a'), planFor('content-search', 'try two', 'b')],
      toolResults: [EMPTY_RESULT, GOOD_RESULT],
    });
    await runV2Pipeline(makeInput(), deps, {
      policy: policy({ maxPlanningRounds: 3, maxToolCallsPerTurn: 1 }),
    });
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it('ends the turn on a direct response without consuming further rounds', async () => {
    const { deps, plannerChat, executeTool } = makeDeps({
      plans: [directResponsePlan()],
      toolResults: [],
    });
    await runV2Pipeline(makeInput({ message: 'Hello!' }), deps, { policy: policy({ maxPlanningRounds: 3 }) });
    expect(plannerChat).toHaveBeenCalledTimes(1);
    expect(executeTool).not.toHaveBeenCalled();
  });
});

// ============================================================================
// RE-PLAN QUALITY — the feedback that makes a retry informed
// ============================================================================

describe('re-planning feedback', () => {
  it('tells the second planner call what the first attempt tried', async () => {
    const { deps, plannerChat } = makeDeps({
      plans: [planFor('content-values', 'list all authors', 'author'), planFor('content-search', 'search topic', 'plasma')],
      toolResults: [EMPTY_RESULT, GOOD_RESULT],
    });
    await runV2Pipeline(makeInput(), deps, { policy: policy() });

    const first = promptsAt(plannerChat, 0).user;
    const second = promptsAt(plannerChat, 1).user;

    // Round one had no prior attempts to report.
    expect(first).not.toContain('Attempts already made');
    // Round two must know what failed, or it is a blind retry.
    expect(second).toContain('Attempts already made this turn');
    expect(second).toContain('content-values');
    expect(second).toContain('list all authors');
    expect(second).toContain('Never repeat an attempt listed above');
  });

  it('marks an errored tool unavailable so a re-plan stops retrying it', async () => {
    // Observed with gpt-4o: told only "do not repeat an attempt", the model
    // re-planned the same failing tool and burned a second round. A tool that
    // errored will error again, so it is called out as unavailable.
    const { deps, plannerChat } = makeDeps({
      plans: [planFor('content-values', 'list', 'a'), planFor('content-search', 'search', 'b')],
      toolResults: [FAILED_RESULT, GOOD_RESULT],
    });
    await runV2Pipeline(makeInput(), deps, { policy: policy() });

    const second = promptsAt(plannerChat, 1).user;
    expect(second).toContain('returned an ERROR and are unavailable');
    expect(second).toContain('`content-values`');
    expect(second).toContain('do not call them again');
  });

  it('does not claim a tool is unavailable when it merely found nothing', async () => {
    // An empty result is not a broken tool — re-planning it with different terms
    // is legitimate, so it must not be blacklisted.
    const { deps, plannerChat } = makeDeps({
      plans: [planFor('content-search', 'narrow search', 'a'), planFor('content-search', 'broad search', 'b')],
      toolResults: [EMPTY_RESULT, GOOD_RESULT],
    });
    await runV2Pipeline(makeInput(), deps, { policy: policy() });

    const second = promptsAt(plannerChat, 1).user;
    expect(second).toContain('Attempts already made this turn');
    expect(second).not.toContain('unavailable');
  });

  it('reports the tool error to the next planner call', async () => {
    const { deps, plannerChat } = makeDeps({
      plans: [planFor('content-search', 'sorted search', 'a'), planFor('content-search', 'plain search', 'b')],
      toolResults: [FAILED_RESULT, GOOD_RESULT],
    });
    await runV2Pipeline(makeInput(), deps, { policy: policy() });
    expect(promptsAt(plannerChat, 1).user).toContain('sorting option not configured');
  });

  it('gives synthesis every round, so an earlier empty attempt is still evidence', async () => {
    const { deps, synthesisChat } = makeDeps({
      plans: [planFor('content-values', 'list authors', 'author'), planFor('content-search', 'search', 'plasma')],
      toolResults: [EMPTY_RESULT, GOOD_RESULT],
    });
    await runV2Pipeline(makeInput(), deps, { policy: policy() });

    const synthPrompt = (synthesisChat.mock.calls[0][0] as Array<{ content: string }>)
      .map((m) => m.content)
      .join('\n');
    // Both attempts should be visible to the response, not just the winner.
    expect(synthPrompt).toContain('content-values');
    expect(synthPrompt).toContain('content-search');
  });

  it('falls through to synthesis with earlier results when a re-plan itself fails', async () => {
    // The re-plan call rejects; the first round's work must not be discarded.
    const plannerChat = vi.fn()
      .mockResolvedValueOnce(planFor('content-search', 'search', 'plasma'))
      .mockRejectedValue(new Error('AI unavailable'));

    const { deps, synthesisChat } = makeDeps({ plans: [], toolResults: [EMPTY_RESULT] });
    deps.turnPlanner = { chat: plannerChat };

    const result = await runV2Pipeline(makeInput(), deps, { policy: policy({ maxPlanningRounds: 2 }) });

    expect(synthesisChat).toHaveBeenCalledTimes(1);
    // Not the hard planning-failure fallback — that only applies to round one.
    expect(result.responseText).not.toContain('trouble understanding');
  });
});

// ============================================================================
// PERSONA IN PLANNING — the previously dropped field
// ============================================================================

describe('includePersonaInPlanning', () => {
  it('adds persona instructions to the planning prompt when enabled', async () => {
    const { deps, plannerChat } = makeDeps({ plans: [planFor('content-search', 'search', 'plasma')], toolResults: [GOOD_RESULT] });
    await runV2Pipeline(makeInput(), deps, { policy: policy({ includePersonaInPlanning: true }) });

    const { system } = promptsAt(plannerChat, 0);
    expect(system).toContain('Assistant instructions');
    expect(system).toContain('Always search before answering');
  });

  it('leaves the planning prompt untouched when disabled', async () => {
    const { deps, plannerChat } = makeDeps({ plans: [planFor('content-search', 'search', 'plasma')], toolResults: [GOOD_RESULT] });
    await runV2Pipeline(makeInput(), deps, { policy: policy({ includePersonaInPlanning: false }) });

    const { system } = promptsAt(plannerChat, 0);
    expect(system).not.toContain('Assistant instructions');
    expect(system).not.toContain('Always search before answering');
  });
});

// ============================================================================
// OBSERVABILITY — autonomy has to be auditable
// ============================================================================

describe('round observability', () => {
  it('emits a distinct step id for a re-planning round', async () => {
    const input = makeInput();
    const { deps } = makeDeps({
      plans: [planFor('content-values', 'list', 'a'), planFor('content-search', 'search', 'b')],
      toolResults: [EMPTY_RESULT, GOOD_RESULT],
    });
    await runV2Pipeline(input, deps, { policy: policy() });

    const events = (input.onEvent as ReturnType<typeof vi.fn>).mock.calls.map(([e]: [PipelineStreamEvent]) => e);
    const plannerStarts = events.filter(
      (e) => e.type === 'step_start' && String((e as { stepId: string }).stepId).startsWith('turn-planner'),
    );
    expect(plannerStarts).toHaveLength(2);
    // A re-plan is labelled so the trace shows it happened rather than hiding it.
    expect(plannerStarts.map((e) => (e as { stepId: string }).stepId)).toEqual([
      'turn-planner',
      'turn-planner-2',
    ]);
    expect((plannerStarts[1] as { stepName: string }).stepName).toContain('Re-planning');
  });
});
