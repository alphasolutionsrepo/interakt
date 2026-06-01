// src/features/pipeline/v2/execution-loop.ts

/**
 * D2: Execution Loop — Deterministic Pipeline V2
 *
 * Iterates through planned actions sequentially. For each action, builds a
 * tool-type-aware step chain and runs it:
 *
 *   data_source:search → Enrich → Extract → FilterValidate → Execute → Retry → Capture
 *   other tools         → Extract → Execute → Capture
 *
 * Each sub-step is a discrete ActionStep with its own tracing span,
 * enabling per-step observability, configurability, and testability.
 *
 * The backend controls the loop — the AI is only consulted for extraction.
 * After batch limit, remaining actions become suggestions.
 *
 * See: docs/platform-evolution/DETERMINISTIC-PIPELINE-V2.md § D2
 */

import { createLogger } from '@/shared/logger/logger';
import type {
  ExecutionLoopInput,
  ExecutionLoopResult,
  ActionResult,
  ToolExecutionResultV2,
  ModuleResult,
} from './v2.types';
import { EMPTY_PARAMETER_CONTEXT } from './parameter-context.types';
import type { ChatFn } from './turn-planner';
import { buildStepChain, getToolTypeKey, runActionStepChain } from './action-steps';
import type { ActionStepContext, ActionStepChainConfig } from './action-steps';

const logger = createLogger('v2:execution-loop');

// ============================================================================
// DEPENDENCY INTERFACES
// ============================================================================

/**
 * Executes a tool by its UUID with validated parameters.
 * In production: wraps the existing tool executor.
 * In tests: mock.
 */
export type ToolExecutorFn = (
  toolId: string,
  toolSlug: string,
  parameters: Record<string, unknown>,
) => Promise<ToolExecutionResultV2>;

export interface ExecutionLoopDeps {
  /** AI chat function for parameter extraction */
  chat: ChatFn;
  /** Tool executor function */
  executeTool: ToolExecutorFn;
}

// ============================================================================
// MODULE ENTRY POINT
// ============================================================================

/**
 * Execute the planned actions sequentially with batching.
 */
export async function executeLoop(
  input: ExecutionLoopInput,
  deps: ExecutionLoopDeps,
): Promise<ModuleResult<ExecutionLoopResult>> {
  const startTime = Date.now();
  const { plan, turnContext, config, emit } = input;
  const { executionBatchSize, maxRetriesPerAction } = config;

  const executedActions: ActionResult[] = [];
  const actionsToExecute = plan.actions.slice(0, executionBatchSize);
  const remainingActions = plan.actions.slice(executionBatchSize);
  const aborted = false;

  try {
    for (let i = 0; i < actionsToExecute.length; i++) {
      const action = actionsToExecute[i];
      const actionStart = Date.now();

      emit({
        type: 'tool_call',
        id: turnContext.toolSlugToId[action.toolSlug] ?? '',
        name: turnContext.toolSlugToName[action.toolSlug] ?? action.toolSlug,
        arguments: action.hints,
      });

      // Check dependency — skip if previous action failed and this depends on it
      if (action.dependsOnPrevious && i > 0) {
        const prev = executedActions[executedActions.length - 1];
        if (!prev || !prev.result.success) {
          logger.info('Skipping dependent action — previous failed', {
            toolSlug: action.toolSlug,
            previousSlug: prev?.toolSlug,
          });
          emit({
            type: 'tool_result',
            id: turnContext.toolSlugToId[action.toolSlug] ?? '',
            success: false,
            durationMs: Date.now() - actionStart,
          });
          continue;
        }
      }

      // Resolve tool definition
      const toolDef = turnContext.toolDefinitions.find((t) => t.slug === action.toolSlug);
      if (!toolDef) {
        logger.warn('Tool definition not found, skipping', { toolSlug: action.toolSlug });
        emit({
          type: 'tool_result',
          id: '',
          success: false,
          durationMs: Date.now() - actionStart,
        });
        continue;
      }

      const toolId = turnContext.toolSlugToId[action.toolSlug];

      // Build tool-type-aware step chain
      const toolTypeKey = getToolTypeKey(toolDef);
      const chainConfig: ActionStepChainConfig = {
        maxRetriesPerAction,
        ...(config as Record<string, unknown>).actionStepOverrides?.[toolTypeKey] as ActionStepChainConfig | undefined,
      };
      const chain = buildStepChain(toolDef, chainConfig);

      // Initialize step context
      const initialCtx: ActionStepContext = {
        action,
        toolDef,
        toolId,
        turnContext,
        previousResults: executedActions,
        paramContext: EMPTY_PARAMETER_CONTEXT,
        sanitizedHints: action.hints,
        hintAnnotations: [],
        extractedParams: null,
        validatedParams: null,
        toolResult: null,
        finalParams: null,
      };

      // Run the step chain
      const chainResult = await runActionStepChain(
        chain,
        initialCtx,
        { chat: deps.chat, executeTool: deps.executeTool, emit, config: chainConfig },
        turnContext.experienceId,
      );

      const { finalContext } = chainResult;

      // Build ActionResult from final context
      const actionResult: ActionResult = {
        toolSlug: action.toolSlug,
        toolId,
        toolName: turnContext.toolSlugToName[action.toolSlug] ?? action.toolSlug,
        intent: action.intent,
        parameters: finalContext.finalParams ?? finalContext.validatedParams ?? finalContext.extractedParams ?? {},
        result: finalContext.toolResult ?? { success: false, data: null, error: 'No tool result' },
        durationMs: Date.now() - actionStart,
      };

      executedActions.push(actionResult);

      emit({
        type: 'tool_result',
        id: toolId,
        success: actionResult.result.success,
        resultCount: actionResult.result.resultCount,
        durationMs: actionResult.durationMs,
      });
    }

    const durationMs = Date.now() - startTime;
    const successCount = executedActions.filter((a) => a.result.success).length;

    return {
      success: true,
      data: {
        executedActions,
        remainingActions,
        aborted,
        summary: `Executed ${executedActions.length}/${actionsToExecute.length} actions (${successCount} succeeded)`,
      },
      summary: `Executed ${executedActions.length} actions, ${remainingActions.length} remaining`,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Execution loop failed', err);

    return {
      success: false,
      data: {
        executedActions,
        remainingActions: [...actionsToExecute.slice(executedActions.length), ...remainingActions],
        aborted: true,
        summary: `Execution loop aborted: ${err.message}`,
      },
      summary: `Execution loop failed: ${err.message}`,
      durationMs,
    };
  }
}

// ============================================================================
// PRODUCTION DEPENDENCY FACTORY
// ============================================================================

export function createProductionExecutionLoopDeps(): ExecutionLoopDeps {
  return {
    async chat(messages, options) {
      const { chat } = await import('@/features/ai-service/ai-service.service');
      return chat(messages, options);
    },
    async executeTool(toolId, toolSlug, parameters) {
      const { executeTool } = await import('@/features/tools/tools.executor');
      const result = await executeTool(toolId, parameters);
      const data = result.data as any;
      // Use actual returned items count (what the pipeline works with), not totalCount (index matches)
      const resultCount =
        (Array.isArray(data?.results) ? data.results.length : undefined) ??
        (Array.isArray(data) ? data.length : undefined) ??
        (result as any).resultCount ??
        data?.totalCount;
      return {
        success: result.success,
        data: result.data,
        resultCount,
        error: result.error,
      };
    },
  };
}
