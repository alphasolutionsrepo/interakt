// src/features/analytics/pipeline/analytics-pipeline-orchestrator.ts

/**
 * Analytics Pipeline Orchestrator
 *
 * Wires S2 → D1 → D2 → D3 → D4 and emits SSE events.
 * Total: 2 AI calls (planner + synthesis).
 */

import 'server-only';

import { createLogger } from '@/shared/logger/logger';
import * as aiService from '@/features/ai-service/ai-service.service';
import { assembleAnalyticsContext } from './analytics-context-assembly';
import { planAnalyticsTurn } from './analytics-turn-planner';
import { executeAnalyticsTools } from './analytics-execution';
import { synthesizeAnalyticsResponse } from './analytics-synthesis';
import { findUnsupportedFigures } from './analytics-grounding';
import { persistAnalyticsTurn } from './analytics-persistence';
import type {
  AnalyticsPipelineInput,
  AnalyticsPipelineResult,
  SSEEmitter,
  ChatFn,
  StreamChatFn,
} from './analytics-pipeline.types';

const logger = createLogger('analytics-pipeline');

/** The asker went away mid-turn; nothing more is worth doing or saving */
class TurnCancelled extends Error {
  constructor() {
    super('Turn cancelled by the asker');
  }
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

export async function runAnalyticsPipeline(
  input: AnalyticsPipelineInput,
  emit: SSEEmitter
): Promise<AnalyticsPipelineResult> {
  const startTime = Date.now();
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const stopIfCancelled = () => {
    if (input.signal?.aborted) throw new TurnCancelled();
  };

  // Create tracked chat functions that accumulate token usage
  const trackedChat: ChatFn = async (messages, options) => {
    const result = await aiService.chat(
      messages as Parameters<typeof aiService.chat>[0],
      {
        ...options,
        ...(input.providerId && { providerId: input.providerId }),
        ...(input.modelId && { modelId: input.modelId }),
      } as Parameters<typeof aiService.chat>[1]
    );
    if (result.usage) {
      usage.inputTokens += result.usage.inputTokens || 0;
      usage.outputTokens += result.usage.outputTokens || 0;
      usage.totalTokens += result.usage.totalTokens || 0;
    }
    return result;
  };

  const trackedStreamChat: StreamChatFn = (messages, options) => {
    return aiService.streamChat(
      messages as Parameters<typeof aiService.streamChat>[0],
      {
        ...options,
        ...(input.providerId && { providerId: input.providerId }),
        ...(input.modelId && { modelId: input.modelId }),
        // Stop ends the answer mid-stream, so no more tokens are spent on it
        signal: input.signal,
      } as Parameters<typeof aiService.streamChat>[1]
    );
  };

  try {
    // ====================================================================
    // S2: Context Assembly
    // ====================================================================
    emit({ type: 'status', message: 'Loading context...' });

    const contextResult = await assembleAnalyticsContext({
      userMessage: input.message,
      sessionId: input.sessionId,
      experienceId: input.experienceId,
      experienceName: input.experienceName,
      timeRange: input.timeRange,
      period: input.period,
      timeZone: input.timeZone,
      pageSection: input.pageSection,
      providerId: input.providerId,
      modelId: input.modelId,
    });

    if (!contextResult.success || !contextResult.data) {
      // summary is user-facing: either a scope mismatch or "Context assembly failed: ..."
      throw new Error(contextResult.summary);
    }

    const context = contextResult.data;
    stopIfCancelled();

    // ====================================================================
    // D1: Turn Planner
    // ====================================================================
    emit({ type: 'status', message: 'Planning analysis...' });

    const planResult = await planAnalyticsTurn(context, trackedChat);

    if (!planResult.success || !planResult.data) {
      throw new Error(`Turn planner failed: ${planResult.summary}`);
    }

    const plan = planResult.data;
    stopIfCancelled();

    logger.info('Pipeline plan', {
      directResponse: plan.directResponse,
      tools: plan.actions.map((a) => a.toolSlug),
      reasoning: plan.reasoning.slice(0, 100),
    });

    // ====================================================================
    // D2: Parallel Execution
    // ====================================================================
    const executionResult = await executeAnalyticsTools(
      plan,
      context.experienceId,
      context.timeRange,
      emit,
      context.period,
      context.timeZone
    );

    if (!executionResult.success || !executionResult.data) {
      throw new Error(`Execution failed: ${executionResult.summary}`);
    }

    const { executedActions, analyticsData } = executionResult.data;
    stopIfCancelled();

    // ====================================================================
    // D3: Synthesis
    // ====================================================================
    const synthesisResult = await synthesizeAnalyticsResponse(
      context,
      executedActions,
      plan.directResponse,
      emit,
      trackedStreamChat,
      trackedChat
    );

    if (!synthesisResult.success || !synthesisResult.data) {
      throw new Error(`Synthesis failed: ${synthesisResult.summary}`);
    }

    // A stopped answer ends early without an error; it is not checked or saved
    stopIfCancelled();
    const { responseText, suggestedFollowUps } = synthesisResult.data;

    // Figures in the answer must come from the data; flag any that don't
    if (executedActions.length > 0) {
      const unverifiedFigures = findUnsupportedFigures(
        responseText,
        executedActions.flatMap((a) => (a.result.success ? [a.result.data, a.result.rawData] : [])),
      );
      emit({ type: 'verification', unverifiedFigures });
      if (unverifiedFigures.length > 0) {
        logger.warn('Answer has figures not found in the tool data', { unverifiedFigures });
      }
    }

    // ====================================================================
    // D4: Persistence
    // ====================================================================
    const toolsUsed = executedActions.map((a) => a.toolSlug);

    // Extract facts from this turn
    const facts: Record<string, string> = {};
    if (executedActions.length > 0) {
      const firstAction = executedActions[0];
      const tr = firstAction.parameters?.timeRange;
      if (tr) facts.lastTimeRange = String(tr);
      facts.lastTopic = firstAction.toolSlug;
    }

    const persistResult = await persistAnalyticsTurn({
      sessionId: context.sessionId,
      experienceId: context.experienceId,
      experienceName: context.experienceName,
      userMessage: input.message,
      responseText,
      toolsUsed,
      analyticsData,
      usage,
      facts,
      providerId: input.providerId,
      modelId: input.modelId,
      chat: trackedChat,
    });

    const sessionId = persistResult.data?.sessionId || context.sessionId || '';

    // Emit done
    emit({
      type: 'done',
      sessionId,
      usage,
      toolsUsed,
    });

    const totalMs = Date.now() - startTime;
    logger.info('Pipeline completed', {
      sessionId,
      durationMs: totalMs,
      aiCalls: 2,
      toolsExecuted: toolsUsed.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    return {
      sessionId,
      responseText,
      toolsUsed,
      analyticsData,
      usage,
    };
  } catch (error) {
    if (error instanceof TurnCancelled || input.signal?.aborted) {
      // Nobody is listening any more: no error to show, and nothing saved
      logger.info('Pipeline stopped by the asker', { durationMs: Date.now() - startTime });
      return { sessionId: input.sessionId || '', responseText: '', toolsUsed: [], analyticsData: [], usage };
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Pipeline failed', { error: errorMessage });

    emit({ type: 'error', error: errorMessage });
    emit({ type: 'done', sessionId: input.sessionId || '', usage, toolsUsed: [] });

    return {
      sessionId: input.sessionId || '',
      responseText: '',
      toolsUsed: [],
      analyticsData: [],
      usage,
    };
  }
}
