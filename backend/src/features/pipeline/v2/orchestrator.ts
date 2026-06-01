// src/features/pipeline/v2/orchestrator.ts

/**
 * V2 Pipeline Orchestrator — Deterministic Pipeline V2
 *
 * Wires all V2 modules together into the complete pipeline:
 *   S2 → D1 → D2 → D3 → D4 → post-turn triggers
 *
 * This replaces the old step-based orchestrator for deterministic mode.
 * Each module is called with typed inputs and injected dependencies.
 *
 * See: docs/platform-evolution/DETERMINISTIC-PIPELINE-V2.md § Pipeline Flow
 */

import { createLogger } from '@/shared/logger/logger';
import { withSpan , ATTR } from '@/features/telemetry';
import { withExperienceContext } from '@/features/search/search.service';
import { assembleContext } from './context-assembly';
import { planTurn } from './turn-planner';
import { executeLoop } from './execution-loop';
import { synthesizeResponse } from './response-synthesis';
import { persistTurn } from './persistence';
import type {
  ContextAssemblyInput,
  TurnContext,
  TurnPlan,
  TurnLogEntry,
  ExecutionLoopResult,
  SynthesisResult,
} from './v2.types';
import type { PipelineStreamEvent, TokenUsage } from '../pipeline.types';
import type { ContextAssemblyDeps } from './context-assembly';
import type { TurnPlannerDeps, ChatFn } from './turn-planner';
import type { ExecutionLoopDeps } from './execution-loop';
import type { SynthesisDeps } from './response-synthesis';
import type { PersistenceDeps } from './persistence';
import type { ChatResult } from '@/features/ai-service/ai-service.types';

const logger = createLogger('v2:orchestrator');

// ============================================================================
// ORCHESTRATOR INPUT/OUTPUT
// ============================================================================

export interface V2PipelineInput {
  /** Pre-loaded AI Experience with tools */
  experience: ContextAssemblyInput['experience'];
  /** User's message */
  message: string;
  /** Session ID (existing or new) */
  sessionId: string;
  /** SSE event callback */
  onEvent: (event: PipelineStreamEvent) => void;
}

export interface V2PipelineResult {
  sessionId: string;
  responseText: string;
  usage: TokenUsage;
}

/**
 * All dependencies for the V2 pipeline, grouped by module.
 * In production: created by createProductionV2Deps().
 * In tests: mock any or all.
 */
export interface V2PipelineDeps {
  contextAssembly: ContextAssemblyDeps;
  turnPlanner: TurnPlannerDeps;
  executionLoop: ExecutionLoopDeps;
  synthesis: SynthesisDeps;
  persistence: PersistenceDeps;
}

export interface V2PipelineConfig {
  /** Max actions to execute per turn (default: 3) */
  executionBatchSize: number;
  /** Max retries for param extraction per action (default: 1) */
  maxRetriesPerAction: number;
  /** Wall-clock ceiling for the entire turn (default: 60s). Matches V1. */
  maxTotalDurationMs: number;
}

const DEFAULT_CONFIG: V2PipelineConfig = {
  executionBatchSize: 3,
  maxRetriesPerAction: 1,
  maxTotalDurationMs: 60_000,
};

const PIPELINE_TIMEOUT = Symbol('v2-pipeline-timeout');

// ============================================================================
// TOKEN USAGE TRACKING
// ============================================================================

/**
 * Wraps a ChatFn to intercept AI call results and accumulate token usage.
 * Also injects experienceId into every chat call so downstream ai.chat spans
 * are properly attributed, and feature tag for pipeline phase identification.
 *
 * ChatResult.usage uses { inputTokens, outputTokens, totalTokens }.
 * Pipeline TokenUsage uses { promptTokens, completionTokens, totalTokens }.
 */
function trackUsage(chatFn: ChatFn, usage: TokenUsage, experienceId: string, feature: string): ChatFn {
  return async (messages, options) => {
    const result: ChatResult = await chatFn(messages, {
      ...options,
      experienceId,
      feature: options?.feature ?? feature,
    });
    if (result.usage) {
      usage.promptTokens += result.usage.inputTokens;
      usage.completionTokens += result.usage.outputTokens;
      usage.totalTokens += result.usage.totalTokens;
    }
    return result;
  };
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Run the complete V2 deterministic pipeline.
 *
 * Flow: S2 → D1 → D2 → D3 → D4 → post-turn triggers
 * (S1 input guardrail and S3 output guardrail run in the chat-pipeline wrapper)
 */
export async function runV2Pipeline(
  input: V2PipelineInput,
  deps: V2PipelineDeps,
  config: Partial<V2PipelineConfig> = {},
): Promise<V2PipelineResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { onEvent } = input;
  const experienceId = input.experience.id;
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  // Wall-clock ceiling. If we cross it, abandon waiting on whatever's in flight
  // and return a graceful timeout response. Losing work continues in the
  // background but is no longer awaited — matches V1 semantics (orchestrator.ts).
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<typeof PIPELINE_TIMEOUT>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(PIPELINE_TIMEOUT), cfg.maxTotalDurationMs);
  });

  const work = withExperienceContext(experienceId, () => withSpan(
    {
      name: 'pipeline.v2.turn',
      experienceId,
      attributes: {
        [ATTR.PIPELINE_TYPE]: 'deterministic_v2',
        [ATTR.EXPERIENCE_ID]: experienceId,
        [ATTR.SESSION_ID]: input.sessionId,
      },
    },
    async (parentSpan) => {

  // Wrap all chat functions to accumulate token usage + inject experienceId/feature
  const trackedDeps: V2PipelineDeps = {
    ...deps,
    turnPlanner: { chat: trackUsage(deps.turnPlanner.chat, usage, experienceId, 'v2.turn-planner') },
    executionLoop: { ...deps.executionLoop, chat: trackUsage(deps.executionLoop.chat, usage, experienceId, 'v2.param-extraction') },
    synthesis: { chat: trackUsage(deps.synthesis.chat, usage, experienceId, 'v2.response-synthesis') },
  };

  // ── S2: Context Assembly ───────────────────────────────────────────────
  onEvent({ type: 'step_start', stepId: 'context-assembly', stepType: 'episodic_memory', stepName: 'Loading context' });

  const ctxResult = await withSpan(
    {
      name: 'pipeline.v2.context_assembly',
      experienceId,
      attributes: {
        [ATTR.PIPELINE_PHASE]: 'context_assembly',
        [ATTR.EXPERIENCE_ID]: experienceId,
        [ATTR.SESSION_ID]: input.sessionId,
      },
    },
    async (span) => {
      const result = await assembleContext(
        {
          sessionId: input.sessionId,
          experienceId,
          userMessage: input.message,
          experience: input.experience,
        },
        trackedDeps.contextAssembly,
      );
      span.setAttribute('alpha.v2.context_assembly.success', result.success);
      span.setAttribute('alpha.v2.context_assembly.summary', result.summary);
      return result;
    },
  );

  onEvent({ type: 'step_complete', stepId: 'context-assembly', stepType: 'episodic_memory', durationMs: ctxResult.durationMs, status: 'ok' });

  if (!ctxResult.success || !ctxResult.data) {
    const errorMsg = ctxResult.summary;
    parentSpan.setAttribute('alpha.v2.outcome', 'context_assembly_failed');
    onEvent({ type: 'error', message: errorMsg });
    onEvent({ type: 'done', sessionId: input.sessionId, usage });
    return { sessionId: input.sessionId, responseText: '', usage };
  }

  const turnContext: TurnContext = ctxResult.data;

  // ── D1: Turn Planner ──────────────────────────────────────────────────
  onEvent({ type: 'step_start', stepId: 'turn-planner', stepType: 'tool_selection', stepName: 'Planning actions' });

  const planResult = await withSpan(
    {
      name: 'pipeline.v2.turn_planner',
      experienceId,
      attributes: {
        [ATTR.PIPELINE_PHASE]: 'turn_planner',
        [ATTR.EXPERIENCE_ID]: experienceId,
        'alpha.v2.available_tools': turnContext.availableTools.length,
        'alpha.v2.planner.context_mode': turnContext.turnLog.length > 0 ? 'turn_log' : 'conversation_history',
        'alpha.v2.planner.turn_log_entries': turnContext.turnLog.length,
        'alpha.v2.planner.conversation_history_messages': turnContext.conversationHistory.length,
      },
    },
    async (span) => {
      const result = await planTurn(
        {
          userMessage: turnContext.userMessage,
          experienceId: turnContext.experienceId,
          conversationHistory: turnContext.conversationHistory,
          conversationSummary: turnContext.conversationSummary,
          turnLog: turnContext.turnLog,
          sessionFacts: turnContext.sessionFacts,
          resultMemoryIndex: turnContext.resultMemoryIndex,
          episodicMemories: turnContext.episodicMemories,
          availableTools: turnContext.availableTools,
          personaInstructions: turnContext.personaInstructions,
          businessDomain: turnContext.businessDomain,
        },
        trackedDeps.turnPlanner,
        {
          providerId: turnContext.providerId ?? undefined,
          modelId: turnContext.modelId ?? undefined,
        },
      );
      span.setAttribute('alpha.v2.plan.success', result.success);
      if (result.data) {
        span.setAttribute('alpha.v2.plan.action_count', result.data.actions.length);
        span.setAttribute('alpha.v2.plan.direct_response', result.data.directResponse ?? false);
        span.setAttribute('alpha.v2.plan.needs_clarification', result.data.needsClarification ?? false);
        // Store planned actions for trace debugging
        if (result.data.actions.length > 0) {
          span.setAttribute('alpha.v2.plan.actions', JSON.stringify(
            result.data.actions.map(a => ({ tool: a.toolSlug, intent: a.intent, hints: a.hints })),
          ));
        }
        if (result.data.clarificationQuestion) {
          span.setAttribute('alpha.v2.plan.clarification', result.data.clarificationQuestion);
        }
        if (result.data.reasoning) {
          const r = result.data.reasoning;
          span.setAttribute('alpha.v2.plan.reasoning', r.length > 500 ? r.slice(0, 500) + '…' : r);
        }
      }
      return result;
    },
  );

  onEvent({ type: 'step_complete', stepId: 'turn-planner', stepType: 'tool_selection', durationMs: planResult.durationMs, status: planResult.success ? 'ok' : 'error' });

  if (!planResult.success || !planResult.data) {
    // Planning failed — synthesize an error response
    const errorText = "I'm having trouble understanding your request right now. Could you try again?";
    parentSpan.setAttribute('alpha.v2.outcome', 'plan_failed');
    onEvent({ type: 'content', text: errorText });
    onEvent({ type: 'done', sessionId: turnContext.sessionId, usage });

    // Still persist the turn (with fallback response)
    await persistTurn(
      {
        sessionId: turnContext.sessionId,
        userMessage: input.message,
        synthesisResult: { responseText: errorText, preset: 'rich_text', responseMetadata: {} },
        actionResults: [],
        resultMemory: turnContext.resultMemory,
        sessionFacts: turnContext.sessionFacts,
        tokenUsage: usage,
        turnLog: turnContext.turnLog,
      },
      trackedDeps.persistence,
    );

    return { sessionId: turnContext.sessionId, responseText: errorText, usage };
  }

  const plan: TurnPlan = planResult.data;

  // ── D2: Execution Loop (skip if directResponse or clarification) ──────
  let executionResult: ExecutionLoopResult = {
    executedActions: [],
    remainingActions: [],
    aborted: false,
    summary: 'No actions to execute',
  };

  if (!plan.directResponse && !plan.needsClarification && plan.actions.length > 0) {
    onEvent({ type: 'step_start', stepId: 'execution-loop', stepType: 'tool_execution', stepName: 'Executing actions' });

    const execResult = await withSpan(
      {
        name: 'pipeline.v2.execution_loop',
        experienceId,
        attributes: {
          [ATTR.PIPELINE_PHASE]: 'execution',
          [ATTR.EXPERIENCE_ID]: experienceId,
          'alpha.v2.planned_actions': plan.actions.length,
        },
      },
      async (span) => {
        // Intercept action_step events to record them as span events for trace visibility
        const actionSteps: Array<{ toolSlug: string; step: string; detail?: string; durationMs: number }> = [];
        const wrappedEmit = (event: PipelineStreamEvent) => {
          if (event.type === 'action_step') {
            actionSteps.push({ toolSlug: event.toolSlug, step: event.step, detail: event.detail, durationMs: event.durationMs });
            span.addEvent(`execution.${event.step}`, {
              'alpha.v2.action_step.tool': event.toolSlug,
              'alpha.v2.action_step.step': event.step,
              'alpha.v2.action_step.detail': event.detail ?? '',
              'alpha.v2.action_step.duration_ms': event.durationMs,
            });
          }
          onEvent(event);
        };

        const result = await executeLoop(
          {
            plan,
            turnContext,
            config: {
              executionBatchSize: cfg.executionBatchSize,
              maxRetriesPerAction: cfg.maxRetriesPerAction,
            },
            emit: wrappedEmit,
          },
          trackedDeps.executionLoop,
        );
        if (result.data) {
          span.setAttribute('alpha.v2.executed_actions', result.data.executedActions.length);
          span.setAttribute('alpha.v2.remaining_actions', result.data.remainingActions.length);
          span.setAttribute('alpha.v2.execution_aborted', result.data.aborted);
          // Store action steps summary for trace viewer
          if (actionSteps.length > 0) {
            span.setAttribute('alpha.v2.action_steps', JSON.stringify(actionSteps));
          }
          // Store per-action execution summaries for trace viewer
          const actionSummaries = result.data.executedActions.map((a) => ({
            tool: a.toolSlug,
            intent: a.intent,
            success: a.result.success,
            resultCount: a.result.resultCount,
            durationMs: a.durationMs,
            hadFilters: Array.isArray(a.parameters?.filters) && (a.parameters.filters as unknown[]).length > 0,
            query: typeof a.parameters?.query === 'string' ? a.parameters.query : undefined,
          }));
          span.setAttribute('alpha.v2.action_summaries', JSON.stringify(actionSummaries));
        }
        return result;
      },
    );

    onEvent({ type: 'step_complete', stepId: 'execution-loop', stepType: 'tool_execution', durationMs: execResult.durationMs, status: execResult.success ? 'ok' : 'error' });

    if (execResult.data) {
      executionResult = execResult.data;
    }
  }

  // ── D3: Response Synthesis ────────────────────────────────────────────
  onEvent({ type: 'step_start', stepId: 'response-synthesis', stepType: 'response_synthesis', stepName: 'Generating response' });

  const synthResult = await withSpan(
    {
      name: 'pipeline.v2.response_synthesis',
      experienceId,
      attributes: {
        [ATTR.PIPELINE_PHASE]: 'synthesis',
        [ATTR.EXPERIENCE_ID]: experienceId,
        'alpha.v2.action_results': executionResult.executedActions.length,
        'alpha.v2.direct_response': plan.directResponse || plan.needsClarification || false,
      },
    },
    async (span) => {
      const result = await synthesizeResponse(
        {
          userMessage: input.message,
          experienceId,
          actionResults: executionResult.executedActions,
          remainingActions: executionResult.remainingActions,
          personaConfig: input.experience.personaConfig,
          toolSlugToDisplayConfig: turnContext.toolSlugToDisplayConfig,
          plan,
          directResponse: plan.directResponse || plan.needsClarification,
          clarificationQuestion: plan.clarificationQuestion ?? undefined,
        },
        trackedDeps.synthesis,
        onEvent,
      );
      if (result.data) {
        span.setAttribute('alpha.v2.preset', result.data.preset);
        span.setAttribute('alpha.v2.response_length', result.data.responseText.length);
        // Store response text for trace debugging (truncated to avoid bloat)
        const text = result.data.responseText;
        span.setAttribute('alpha.v2.response_text', text.length > 2000 ? text.slice(0, 2000) + '…' : text);
        // Preset selection debug info
        if (result.data.presetDebug) {
          const pd = result.data.presetDebug;
          span.setAttribute('alpha.v2.preset_reason', pd.reason);
          span.setAttribute('alpha.v2.preset_item_count', pd.itemCount);
          span.setAttribute('alpha.v2.preset_enabled', pd.enabledPresets.join(', '));
          span.setAttribute('alpha.v2.preset_visual_groups', pd.visualGroupCount);
          if (pd.toolSlug) span.setAttribute('alpha.v2.preset_tool', pd.toolSlug);
          if (pd.toolPreferredPresets) span.setAttribute('alpha.v2.preset_tool_preferred', pd.toolPreferredPresets.join(', '));
        }
      }
      return result;
    },
  );

  onEvent({ type: 'step_complete', stepId: 'response-synthesis', stepType: 'response_synthesis', durationMs: synthResult.durationMs, status: 'ok' });

  const synthesisResult: SynthesisResult = synthResult.data ?? {
    responseText: '',
    preset: 'rich_text',
    responseMetadata: {},
  };

  // ── Build turn log entry for this turn ─────────────────────────────────
  const thisTurnEntry: TurnLogEntry = {
    userMessage: input.message,
    decision: plan.directResponse
      ? 'direct_response'
      : plan.needsClarification
        ? 'clarification'
        : 'tool_use',
    toolsUsed: executionResult.executedActions.map((a) => {
      // Record what ACTUALLY executed, not just the planner's intent
      const actualQuery = typeof a.parameters?.query === 'string' ? a.parameters.query : null;

      // Use the actual items returned (data.results.length or data.length), not totalCount
      const data = a.result.data as any;
      const resultsReturned =
        (Array.isArray(data?.results) ? data.results.length : undefined) ??
        (Array.isArray(data) ? data.length : undefined) ??
        a.result.resultCount ??
        null;

      return {
        slug: a.toolSlug,
        intent: a.intent,
        query: actualQuery,
        resultsReturned,
        success: a.result.success,
      };
    }),
    preset: synthesisResult.preset ?? null,
    turnIndex: (turnContext.turnLog.length) + 1,
  };

  const updatedTurnLog = [...turnContext.turnLog, thisTurnEntry];

  // ── D4: Persistence ───────────────────────────────────────────────────
  await withSpan(
    {
      name: 'pipeline.v2.persistence',
      experienceId,
      attributes: {
        [ATTR.PIPELINE_PHASE]: 'persistence',
        [ATTR.EXPERIENCE_ID]: experienceId,
        'alpha.v2.action_count': executionResult.executedActions.length,
        'alpha.v2.turn_log_size': updatedTurnLog.length,
      },
    },
    async () => {
      await persistTurn(
        {
          sessionId: turnContext.sessionId,
          userMessage: input.message,
          synthesisResult,
          actionResults: executionResult.executedActions,
          resultMemory: turnContext.resultMemory,
          sessionFacts: turnContext.sessionFacts,
          tokenUsage: usage,
          turnLog: updatedTurnLog,
        },
        trackedDeps.persistence,
      );
    },
  );

  // ── Post-turn triggers (fire-and-forget) ──────────────────────────────
  triggerPostTurnTasks(turnContext, input.experience, onEvent);

  // ── Done ──────────────────────────────────────────────────────────────
  parentSpan.setAttribute('alpha.v2.outcome', 'success');
  parentSpan.setAttribute(ATTR.AI_TOTAL_TOKENS, usage.totalTokens);
  parentSpan.setAttribute(ATTR.AI_INPUT_TOKENS, usage.promptTokens);
  parentSpan.setAttribute(ATTR.AI_OUTPUT_TOKENS, usage.completionTokens);
  parentSpan.setAttribute('alpha.v2.preset', synthesisResult.preset);

  onEvent({ type: 'done', sessionId: turnContext.sessionId, usage });

  return {
    sessionId: turnContext.sessionId,
    responseText: synthesisResult.responseText,
    usage,
  };

    }, // end withSpan callback
  )); // end withSpan + withExperienceContext

  const raced = await Promise.race([work, timeoutPromise]);
  if (timeoutHandle) clearTimeout(timeoutHandle);

  if (raced === PIPELINE_TIMEOUT) {
    logger.warn('V2 pipeline timed out — returning graceful response', {
      experienceId,
      sessionId: input.sessionId,
      maxTotalDurationMs: cfg.maxTotalDurationMs,
    });
    onEvent({ type: 'error', message: 'Pipeline execution timed out' });
    onEvent({ type: 'done', sessionId: input.sessionId, usage });
    return { sessionId: input.sessionId, responseText: '', usage };
  }

  return raced;
}

// ============================================================================
// POST-TURN TRIGGERS (fire-and-forget)
// ============================================================================

/**
 * Fire-and-forget post-turn tasks: episodic memory extraction and summarization.
 * Mirrors V1 behavior from chat-pipeline.ts (steps 7 & 8).
 */
function triggerPostTurnTasks(
  turnContext: TurnContext,
  experience: V2PipelineInput['experience'],
  onEvent: V2PipelineInput['onEvent'],
): void {
  const { sessionId, userId, sessionMessageCount, providerId, modelId } = turnContext;
  const sessionConfig = experience.sessionConfig;

  // Episodic memory extraction (requires identified user). Wrapped in a span
  // so failures surface in /analytics/traces, not just stderr.
  if (userId) {
    void withSpan(
      {
        name: 'pipeline.post.episodic_memory_extraction',
        experienceId: experience.id,
        attributes: {
          [ATTR.EXPERIENCE_ID]: experience.id,
          [ATTR.SESSION_ID]: sessionId,
          'alpha.user.id': userId,
        },
      },
      async (span) => {
        const { extractMemoriesFromSession } = await import('@/features/user-memories/memory-extraction.service');
        const result = await extractMemoriesFromSession(sessionId, userId, experience.id, {
          providerId: providerId ?? undefined,
          modelId: modelId ?? undefined,
        });
        span.setAttribute('alpha.memory.stored', result.stored);
        span.setAttribute('alpha.memory.extracted', result.extracted);
        if (result.stored > 0) {
          logger.info('Episodic memory extraction completed', {
            sessionId, userId, stored: result.stored, extracted: result.extracted,
          });
        }
      },
    ).catch((err: Error) => {
      logger.error('Async memory extraction failed', err, { sessionId, userId });
    });
  }

  // Summarization (when message count exceeds threshold)
  const newMessageCount = sessionMessageCount + 2; // user + assistant
  const summaryThreshold = sessionConfig.summaryThreshold ?? 30;
  const maxContextMessages = sessionConfig.maxContextMessages ?? 20;
  const enableSummary = sessionConfig.enableConversationSummary ?? true;

  if (enableSummary) {
    void withSpan(
      {
        name: 'pipeline.post.summarization',
        experienceId: experience.id,
        attributes: {
          [ATTR.EXPERIENCE_ID]: experience.id,
          [ATTR.SESSION_ID]: sessionId,
          'alpha.summarization.message_count': newMessageCount,
          'alpha.summarization.threshold': summaryThreshold,
        },
      },
      async (span) => {
        const sessionsService = await import('@/features/sessions/sessions.service');
        const shouldRun = sessionsService.shouldSummarize(newMessageCount, summaryThreshold);
        span.setAttribute('alpha.summarization.triggered', shouldRun);
        if (!shouldRun) return;

        onEvent({ type: 'step_start', stepId: 'summarization', stepType: 'query_rewriter', stepName: 'Summarizing conversation' });

        const { summarizeSession } = await import('@/features/sessions/summarization.service');
        const result = await summarizeSession(sessionId, maxContextMessages, {
          providerId: providerId ?? undefined,
          modelId: modelId ?? undefined,
        });
        span.setAttribute('alpha.summarization.performed', result.performed);
        if (result.performed) {
          span.setAttribute('alpha.summarization.messages_summarized', result.messagesSummarized);
          logger.info('Summarization completed', { sessionId, messagesSummarized: result.messagesSummarized });
        }
      },
    ).catch((err: Error) => {
      logger.error('Async summarization failed', err, { sessionId });
    });
  }
}

// ============================================================================
// PRODUCTION DEPENDENCY FACTORY
// ============================================================================

/**
 * Create all production dependencies for the V2 pipeline.
 */
export function createProductionV2Deps(
  experienceId: string,
  providerId?: string,
  modelId?: number,
): V2PipelineDeps {
  // Lazy imports to avoid circular dependencies
  const chatFn: ChatFn = async (messages, options) => {
    const { chat } = await import('@/features/ai-service/ai-service.service');
    return chat(messages, options);
  };

  const toolExecutorFn: import('./execution-loop').ToolExecutorFn = async (toolId, _toolSlug, parameters) => {
    const { executeTool } = await import('@/features/tools/tools.executor');
    const result = await executeTool(toolId, parameters);
    return {
      success: result.success,
      data: result.data,
      resultCount:
        (result as any).resultCount ??
        (result.data as any)?.totalCount ??
        (Array.isArray((result.data as any)?.results) ? (result.data as any).results.length : undefined) ??
        (Array.isArray(result.data) ? result.data.length : undefined) ??
        // Lookup results return { id, document } — count as 1 result
        ((result.data as any)?.document ? 1 : undefined),
      error: result.error,
    };
  };

  return {
    contextAssembly: {
      sessionLoader: {
        async getSessionWithWindow(sessionId, windowSize) {
          const { getSessionWithWindow } = await import('@/features/sessions/sessions.service');
          const result = await getSessionWithWindow(sessionId, windowSize);
          if (!result) return null;
          return {
            session: {
              id: result.session.id,
              summary: (result.session as any).summary ?? null,
              facts: (result.session as any).facts as Record<string, string> | null ?? null,
              pipelineState: (result.session as any).pipelineState as Record<string, unknown> | null ?? null,
              userContext: (result.session as any).userContext as { userId?: string } | null ?? null,
              messageCount: (result.session as any).messageCount ?? 0,
              status: result.session.status,
            },
            messages: result.messages.map((m: any) => ({
              role: m.role,
              content: m.content,
              createdAt: m.createdAt,
            })),
          };
        },
        async createSession(expId, ttlMinutes) {
          const { createSession } = await import('@/features/sessions/sessions.service');
          const newSession = await createSession({ aiExperienceId: expId, ttlMinutes });
          return {
            session: { id: newSession.id, summary: null, facts: null, pipelineState: null, userContext: null, messageCount: 0, status: 'active' },
            messages: [],
          };
        },
      },
      episodicMemoryLoader: {
        async retrieveRelevantMemories(userId, expId, userMessage, maxMemories) {
          const { embed } = await import('@/features/embedding/embedding.service');
          const memoriesRepo = await import('@/features/user-memories/user-memories.repository');
          const queryVector = await embed(userMessage, { feature: 'episodic_memory' } as any);
          if (!queryVector) return [];
          const memories = await memoriesRepo.searchMemories(userId, expId, queryVector, maxMemories, 0.45);
          if (memories.length > 0) {
            memoriesRepo.recordRetrievals(memories.map((m: any) => m.id)).catch(() => {});
          }
          return memories.map((m: any) => m.content as string);
        },
      },
    },
    turnPlanner: { chat: chatFn },
    executionLoop: { chat: chatFn, executeTool: toolExecutorFn },
    synthesis: { chat: chatFn },
    persistence: {
      async addMessages(sessionId, messages) {
        const sessionsService = await import('@/features/sessions/sessions.service');
        await sessionsService.addMessages(sessionId, messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          metadata: m.metadata,
        })));
      },
      async updateSession(sessionId, updates) {
        const sessionsService = await import('@/features/sessions/sessions.service');
        await sessionsService.updateSession(sessionId, updates as any);
      },
    },
  };
}
