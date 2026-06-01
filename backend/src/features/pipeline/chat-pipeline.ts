// src/features/pipeline/chat-pipeline.ts

/**
 * Chat Pipeline Runner
 *
 * The entry point that wires everything together:
 * - Loads AI Experience config
 * - Creates/loads session from DB
 * - Builds pipeline config (from experience or defaults)
 * - Builds pipeline context with session data, conversation history, tools
 * - Calls the orchestrator
 * - Persists messages and session updates after the turn
 *
 * This replaces the old ai-experience-chat.pipeline.ts.
 */

import { createLogger } from '@/shared/logger/logger';
import { withSpan } from '@/features/telemetry';
import { ATTR } from '@/features/telemetry/attribute-keys';
import { withAnalyticsSource } from '@/features/search/search.service';
import { executePipeline } from './orchestrator';
import { runV2Pipeline, createProductionV2Deps } from './v2';
import * as sessionsService from '@/features/sessions/sessions.service';
import { summarizeSession } from '@/features/sessions/summarization.service';
import { extractMemoriesFromSession } from '@/features/user-memories/memory-extraction.service';
import { classifyMessage } from '@/features/guardrails/message-classifier';
import type { TopicGateRuleConfig } from '@/features/guardrails/topic-gate.service';
import type { ClassificationResult } from '@/features/guardrails/message-classification.types';
import { synthesizeLightweightResponse, createProductionSynthesisDeps } from './v2/response-synthesis';
import type {
  PipelineConfig,
  PipelineContext,
  PipelineMode,
  PipelineStreamEvent,
  PipelineStep,
  ConversationMessage,
  ResultMemoryStore,
} from './pipeline.types';
import type { ToolDefinition, ToolParameterSchema } from '@/features/ai-service/ai-service.types';
import type { AIExperienceWithTools } from '@/features/ai-experience/ai-experience.types';
import { buildMcpToolId, buildLlmFacingName } from '@/features/mcp-connection/mcp-tool-resolver';
import type { SessionConfig, PersonaConfig, GuardrailConfig, AgenticConfig } from '@/db/schema';

const logger = createLogger('chat-pipeline');

// ============================================================================
// MODE RESOLUTION
// ============================================================================

const VALID_PIPELINE_MODES: readonly PipelineMode[] = ['agentic', 'deterministic'];
const DEFAULT_PIPELINE_MODE: PipelineMode = 'agentic';

/**
 * Resolve and validate pipelineMode at runtime. The API write path already
 * enforces the enum (ai-experience.validation.ts), but a value can still drift
 * via DB tampering or schema-skipping migrations. Warn loudly on unknown values
 * so they don't silently fall through to the default mode.
 */
function resolvePipelineMode(raw: unknown, experienceId?: string): PipelineMode {
  if (raw == null) return DEFAULT_PIPELINE_MODE;
  if (typeof raw === 'string' && (VALID_PIPELINE_MODES as readonly string[]).includes(raw)) {
    return raw as PipelineMode;
  }
  logger.warn('Unknown pipelineMode — falling back to default', {
    received: raw,
    defaultedTo: DEFAULT_PIPELINE_MODE,
    experienceId,
  });
  return DEFAULT_PIPELINE_MODE;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export interface ChatPipelineInput {
  /** The AI Experience (pre-loaded by route handler) */
  experience: AIExperienceWithTools;
  /** User's message */
  message: string;
  /** Session ID (existing or new) */
  sessionId?: string;
  /** Analytics source: 'api' (external), 'admin_test' (dashboard), 'playground' */
  analyticsSource?: 'api' | 'playground' | 'admin_test';
  /** Callback for streaming events */
  onEvent: (event: PipelineStreamEvent) => void;
}

export interface ChatPipelineResult {
  sessionId: string;
  responseText: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/**
 * Run the chat pipeline for an AI Experience.
 * This is the main entry point called by the chat route handler.
 */
export async function runChatPipeline(input: ChatPipelineInput): Promise<ChatPipelineResult> {
  const mode = resolvePipelineMode(input.experience.pipelineMode, input.experience.id);
  return withSpan(
    {
      name: 'chat.ai_experience.turn',
      attributes: {
        [ATTR.EXPERIENCE_ID]: input.experience.id,
        [ATTR.EXPERIENCE_SLUG]: input.experience.slug,
        [ATTR.EXPERIENCE_TYPE]: 'ai',
        [ATTR.PIPELINE_TYPE]: mode,
        [ATTR.CHAT_USER_MESSAGE]: input.message,
        'alpha.analytics.source': input.analyticsSource ?? 'api',
      },
    },
    () => withAnalyticsSource(input.analyticsSource ?? 'api', () => _runChatPipeline(input)),
  );
}

async function _runChatPipeline(input: ChatPipelineInput): Promise<ChatPipelineResult> {
  const mode = resolvePipelineMode(input.experience.pipelineMode, input.experience.id);

  // ── V2 Deterministic Pipeline ──────────────────────────────────────────
  // Uses the new Plan-Execute-Synthesize architecture.
  // Context assembly, planning, execution, synthesis, and persistence
  // are all handled inside runV2Pipeline — no step-based orchestrator.
  if (mode === 'deterministic') {
    return _runDeterministicV2(input);
  }

  // ── V1 Agentic Pipeline (unchanged) ───────────────────────────────────
  return _runAgenticV1(input);
}

/**
 * Run the V2 deterministic pipeline (Plan-Execute-Synthesize).
 * Handles S1 input guardrails before the pipeline and S3 output guardrails after.
 * See: docs/platform-evolution/DETERMINISTIC-PIPELINE-V2.md
 */
async function _runDeterministicV2(input: ChatPipelineInput): Promise<ChatPipelineResult> {
  const { experience, message, onEvent } = input;
  const emptyUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  // ── S1: Input Guardrail + Message Classification ────────────────────
  const guardrailConfig = experience.guardrailConfig as GuardrailConfig | null;
  const personaConfig = experience.personaConfig as PersonaConfig;
  const sessionConfig = experience.sessionConfig as SessionConfig;

  let classification: ClassificationResult | null = null;

  if (guardrailConfig?.inputGuardrail?.enabled) {
    // Debug: log actual domainFilterEnabled value to diagnose caching issues
    const tgRule = ((guardrailConfig.inputGuardrail.rules ?? []) as Array<{ type: string; config: Record<string, unknown> }>)
      .find((r) => r.type === 'topic_gate');
    logger.info('Guardrail config loaded', {
      experienceId: experience.id,
      domainFilterEnabled: tgRule?.config?.domainFilterEnabled ?? 'no-topic-gate-rule',
      rulesCount: (guardrailConfig.inputGuardrail.rules as unknown[])?.length ?? 0,
    });
    const guardrailT0 = performance.now();

    classification = await withSpan(
      {
        name: 'pipeline.v2.input_guardrail',
        experienceId: experience.id,
        attributes: {
          [ATTR.PIPELINE_PHASE]: 'input_guardrail',
          [ATTR.EXPERIENCE_ID]: experience.id,
        },
      },
      async (span) => {
        const rules = guardrailConfig.inputGuardrail.rules ?? [];
        const enabledRules = rules.filter((r: any) => r.enabled);
        span.setAttribute('alpha.v2.guardrail.rules_count', enabledRules.length);

        // Extract topic gate config
        const tgRule = enabledRules.find((r: any) => r.type === 'topic_gate');
        const topicGateRuleConfig = tgRule
          ? (tgRule.config as unknown as TopicGateRuleConfig)
          : null;
        const domainFilterEnabled = topicGateRuleConfig?.domainFilterEnabled ?? false;

        const result = await classifyMessage(experience.id, message, {
          guardrailRules: rules,
          topicGateRuleConfig,
          domainFilterEnabled,
          blockMessage: guardrailConfig.inputGuardrail.onBlock?.message
            ?? 'Your message was blocked by content policy.',
        });

        // ── Child spans for each sub-stage (retroactive, using stageTimings) ──
        const timings = result.debug.stageTimings;
        if (timings) {
          // Blocklist check span
          await withSpan(
            {
              name: 'pipeline.v2.guardrail.blocklist_check',
              attributes: {
                [ATTR.V2_GUARDRAIL_BLOCKLIST_MATCHED]: result.classification === 'blocked',
                'alpha.v2.guardrail.duration_ms': timings.blocklistCheckMs,
              },
            },
            async () => { /* retroactive — timing already captured */ },
          );

          // Greeting detection span (only if blocklist didn't match)
          if (timings.greetingDetectionMs !== undefined) {
            await withSpan(
              {
                name: 'pipeline.v2.guardrail.greeting_detection',
                attributes: {
                  [ATTR.V2_GUARDRAIL_GREETING_REGEX]: result.debug.greetingRegexMatched,
                  'alpha.v2.guardrail.duration_ms': timings.greetingDetectionMs,
                },
              },
              async () => { /* retroactive */ },
            );
          }

          // Domain filter span (only if greeting didn't match + domain filter enabled)
          if (timings.domainFilterMs !== undefined) {
            await withSpan(
              {
                name: 'pipeline.v2.guardrail.domain_filter',
                attributes: {
                  [ATTR.V2_GUARDRAIL_DOMAIN_FILTER_ENABLED]: true,
                  [ATTR.V2_GUARDRAIL_DOMAIN_SIMILARITY]: result.debug.domainSimilarity !== undefined
                    ? Math.round(result.debug.domainSimilarity * 1000) / 1000 : 0,
                  [ATTR.V2_GUARDRAIL_GENERAL_SIMILARITY]: result.debug.generalSimilarity !== undefined
                    ? Math.round(result.debug.generalSimilarity * 1000) / 1000 : 0,
                  [ATTR.V2_GUARDRAIL_CLOSEST_DOMAIN_TERM]: result.debug.closestDomainTerm ?? '',
                  [ATTR.V2_GUARDRAIL_CLOSEST_GENERAL_TERM]: result.debug.closestGeneralTerm ?? '',
                  'alpha.v2.guardrail.duration_ms': timings.domainFilterMs,
                },
              },
              async () => { /* retroactive */ },
            );
          }
        }

        // Set parent span trace attributes
        span.setAttribute(ATTR.V2_GUARDRAIL_CLASSIFICATION, result.classification);
        span.setAttribute(ATTR.V2_GUARDRAIL_GREETING_REGEX, result.debug.greetingRegexMatched);
        span.setAttribute(ATTR.V2_GUARDRAIL_DOMAIN_FILTER_ENABLED, result.debug.domainFilterEnabled);
        span.setAttribute(ATTR.V2_GUARDRAIL_SHORT_CIRCUITED, result.classification !== 'domain');
        span.setAttribute(ATTR.V2_GUARDRAIL_BLOCKLIST_MATCHED, result.classification === 'blocked');
        if (result.debug.domainSimilarity !== undefined) {
          span.setAttribute(ATTR.V2_GUARDRAIL_DOMAIN_SIMILARITY, Math.round(result.debug.domainSimilarity * 1000) / 1000);
        }
        if (result.debug.generalSimilarity !== undefined) {
          span.setAttribute(ATTR.V2_GUARDRAIL_GENERAL_SIMILARITY, Math.round(result.debug.generalSimilarity * 1000) / 1000);
        }
        if (result.debug.closestDomainTerm) {
          span.setAttribute(ATTR.V2_GUARDRAIL_CLOSEST_DOMAIN_TERM, result.debug.closestDomainTerm);
        }
        if (result.debug.closestGeneralTerm) {
          span.setAttribute(ATTR.V2_GUARDRAIL_CLOSEST_GENERAL_TERM, result.debug.closestGeneralTerm);
        }

        return result;
      },
    );

    const guardrailDurationMs = performance.now() - guardrailT0;

    // In an active session, "general" messages are likely follow-ups (e.g. "sure, blue as a color")
    // rather than random smalltalk. Let them through to the full pipeline.
    const hasActiveSession = !!input.sessionId;
    const isShortCircuit = classification.classification !== 'domain'
      && !(hasActiveSession && classification.classification === 'general');

    onEvent({
      type: 'step_complete',
      stepId: 'input-guardrail',
      stepType: 'input_guardrail',
      durationMs: guardrailDurationMs,
      status: classification.classification === 'blocked' ? 'error' : 'ok',
    });

    // Emit classification SSE event for ChatTestPanel
    onEvent({
      type: 'classification',
      classification: classification.classification,
      debug: {
        greetingRegexMatched: classification.debug.greetingRegexMatched,
        domainFilterEnabled: classification.debug.domainFilterEnabled,
        domainSimilarity: classification.debug.domainSimilarity,
        generalSimilarity: classification.debug.generalSimilarity,
        closestDomainTerm: classification.debug.closestDomainTerm,
        closestGeneralTerm: classification.debug.closestGeneralTerm,
        shortCircuited: isShortCircuit,
      },
    });

    // ── Blocked: static reject, no persistence ─────────────────────────
    if (classification.classification === 'blocked') {
      const blockMessage = classification.blockMessage
        ?? 'Your message was blocked by content policy.';
      onEvent({ type: 'content', text: blockMessage });
      onEvent({ type: 'done', sessionId: input.sessionId ?? '', usage: emptyUsage });
      return { sessionId: input.sessionId ?? '', responseText: blockMessage, usage: emptyUsage };
    }

    // ── Short-circuit: greeting | general | off_topic ──────────────────
    if (isShortCircuit) {
      const shortCircuitClassification = classification.classification as 'greeting' | 'general' | 'off_topic';

      // Resolve/create session for persistence
      const { session } = await resolveSession(
        input.sessionId,
        experience.id,
        sessionConfig,
      );

      // Lightweight AI synthesis with persona tone (wrapped in its own span)
      const synthDeps = createProductionSynthesisDeps();
      const responseText = await withSpan(
        {
          name: 'pipeline.v2.guardrail.lightweight_synthesis',
          attributes: {
            [ATTR.V2_GUARDRAIL_CLASSIFICATION]: shortCircuitClassification,
            [ATTR.PIPELINE_PHASE]: 'synthesis',
          },
        },
        async (synthSpan) => {
          const text = await synthesizeLightweightResponse(
            {
              userMessage: message,
              experienceId: experience.id,
              personaConfig: {
                name: personaConfig.name,
                tone: personaConfig.tone,
                systemInstructions: personaConfig.systemInstructions,
              },
              classification: shortCircuitClassification,
              allowedDomains: personaConfig.businessDomains,
            },
            synthDeps,
            {
              providerId: experience.providerId ?? undefined,
              modelId: experience.modelId ?? undefined,
            },
          );
          synthSpan.setAttribute('alpha.v2.guardrail.response_length', text.length);
          synthSpan.setAttribute('alpha.v2.guardrail.response_text', text.length > 2000 ? text.slice(0, 2000) + '…' : text);
          return text;
        },
      );

      // Persist user + assistant messages
      try {
        await sessionsService.addMessages(session.id, [
          { role: 'user', content: message },
          {
            role: 'assistant',
            content: responseText,
            metadata: {
              responseData: {
                preset: 'rich_text' as const,
                content: { shortCircuited: true, classification: shortCircuitClassification },
              },
            },
          },
        ]);
      } catch (error) {
        logger.error('Failed to persist short-circuit messages', error as Error, {
          sessionId: session.id,
        });
      }

      onEvent({ type: 'content', text: responseText });
      onEvent({ type: 'done', sessionId: session.id, usage: emptyUsage });
      return { sessionId: session.id, responseText, usage: emptyUsage };
    }
  }

  // ── Run V2 Pipeline (S2 → D1 → D2 → D3 → D4) ───────────────────────
  const deps = createProductionV2Deps(
    experience.id,
    experience.providerId ?? undefined,
    experience.modelId ?? undefined,
  );

  const result = await runV2Pipeline(
    {
      experience: {
        id: experience.id,
        slug: experience.slug,
        providerId: experience.providerId,
        modelId: experience.modelId,
        personaConfig: {
          systemInstructions: personaConfig.systemInstructions,
          businessDomains: personaConfig.businessDomains,
          tone: personaConfig.tone,
          name: personaConfig.name,
          responseFormats: personaConfig.responseFormats,
        },
        sessionConfig: {
          maxContextMessages: sessionConfig.maxContextMessages,
          summaryThreshold: sessionConfig.summaryThreshold,
          enableConversationSummary: sessionConfig.enableConversationSummary,
        },
        tools: experience.tools.map((t) => ({
          isEnabled: t.isEnabled,
          overrideAiDescription: t.overrideAiDescription,
          tool: {
            ...t.tool,
            displayConfig: (t.tool as any).displayConfig ?? null,
          },
        })),
        mcpConnections: (experience.mcpConnections ?? []).map((a) => ({
          isEnabled: a.isEnabled,
          enabledToolNames: a.enabledToolNames,
          mcpConnection: {
            id: a.mcpConnection.id,
            slug: a.mcpConnection.slug,
            name: a.mcpConnection.name,
            isActive: a.mcpConnection.isActive,
            discoveredTools: a.mcpConnection.discoveredTools,
          },
        })),
      },
      message,
      sessionId: input.sessionId ?? '',
      onEvent,
    },
    deps,
  );

  // ── S3: Output Guardrail ─────────────────────────────────────────────
  let responseText = result.responseText;

  if (guardrailConfig?.outputGuardrail?.enabled && responseText) {
    const outputResult = evaluateOutputGuardrailRules(
      guardrailConfig.outputGuardrail.rules ?? [],
      responseText,
    );
    if (outputResult.blocked) {
      responseText = guardrailConfig.outputGuardrail.onBlock?.message
        ?? 'The response was blocked by content policy.';
    } else if (outputResult.redactedText) {
      responseText = outputResult.redactedText;
    }
  }

  return {
    sessionId: result.sessionId,
    responseText,
    usage: result.usage,
  };
}

/**
 * Run the V1 agentic pipeline (step-based orchestrator).
 * This path is unchanged — only deterministic mode uses V2.
 */
async function _runAgenticV1(input: ChatPipelineInput): Promise<ChatPipelineResult> {
  const { experience, message, onEvent } = input;
  const sessionConfig = experience.sessionConfig as SessionConfig;

  // 1. Resolve or create session
  const { session, messages: windowMessages } = await resolveSession(
    input.sessionId,
    experience.id,
    sessionConfig,
  );

  // 2. Build pipeline config from experience
  const pipelineConfig = buildPipelineConfig(experience);

  // 3. Build pipeline context
  const conversationHistory = windowMessages.map(m => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
    timestamp: m.createdAt.toISOString(),
  })) satisfies ConversationMessage[];

  // Load result memory persisted from previous turns (stored in pipelineState)
  const storedPipelineState = session.pipelineState as Record<string, unknown> | null;
  const resultMemory: ResultMemoryStore = (storedPipelineState?.result_memory as ResultMemoryStore | undefined)
    ?? { sets: {}, referenceIndex: [] };

  const ctx: PipelineContext = {
    experienceId: experience.id,
    experienceSlug: experience.slug,
    userMessage: message,
    sessionId: session.id,
    conversationHistory,
    resultMemory,
    stepResults: {},
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    emitEvent: onEvent,
    responseText: '',
    responseMetadata: {},
    aborted: false,
    shared: buildSharedContext(experience, session),
  };

  // 4. Execute pipeline
  try {
    await executePipeline(pipelineConfig, ctx);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Pipeline execution failed', err, { experienceId: experience.id, sessionId: session.id });
    onEvent({ type: 'error', message: err.message });
  }

  // 5. Persist messages (user + assistant)
  try {
    await sessionsService.addMessages(session.id, [
      { role: 'user', content: message },
      {
        role: 'assistant',
        content: ctx.responseText,
        metadata: {
          tokenUsage: ctx.tokenUsage,
          responseData: ctx.responseMetadata.preset
            ? { preset: ctx.responseMetadata.preset as string, content: ctx.responseMetadata }
            : undefined,
        },
      },
    ]);
  } catch (error) {
    logger.error('Failed to persist messages', error as Error, { sessionId: session.id });
  }

  // 6. Update session state (pipeline state, result memory, last tool results)
  try {
    const updates: Record<string, unknown> = {};
    if (ctx.shared.lastToolResults) updates.lastToolResults = ctx.shared.lastToolResults;

    // Merge result memory into pipelineState so it survives across turns
    const existingPipelineState = (ctx.shared.pipelineState as Record<string, unknown> | undefined) ?? {};
    const updatedPipelineState: Record<string, unknown> = { ...existingPipelineState };
    if (ctx.shared.pendingResultMemoryUpdate) {
      updatedPipelineState.result_memory = ctx.shared.pendingResultMemoryUpdate;
    }
    if (Object.keys(updatedPipelineState).length > 0) {
      updates.pipelineState = updatedPipelineState;
    }

    if (Object.keys(updates).length > 0) {
      await sessionsService.updateSession(session.id, updates as any);
    }
  } catch (error) {
    logger.error('Failed to update session state', error as Error, { sessionId: session.id });
  }

  // 7. Trigger episodic memory extraction (fire-and-forget, non-blocking)
  const sessionUserContext = session.userContext as { userId?: string } | null;
  if (sessionUserContext?.userId) {
    triggerMemoryExtraction(
      session.id,
      sessionUserContext.userId,
      experience.id,
      experience.providerId ?? undefined,
      experience.modelId ?? undefined,
    );
  }

  // 8. Check if summarization is needed (fire-and-forget, non-blocking)
  const newMessageCount = session.messageCount + 2; // user + assistant
  const summaryThreshold = sessionConfig.summaryThreshold ?? 30;
  const maxContextMessages = sessionConfig.maxContextMessages ?? 20;
  if (sessionsService.shouldSummarize(newMessageCount, summaryThreshold)) {
    onEvent({ type: 'step_start', stepId: 'summarization', stepType: 'query_rewriter', stepName: 'Summarizing conversation' });

    // Run async — don't block the response. Wrapped in a span so summarization
    // failures show up in /analytics/traces instead of only stderr.
    void withSpan(
      {
        name: 'pipeline.post.summarization',
        experienceId: experience.id,
        attributes: {
          [ATTR.EXPERIENCE_ID]: experience.id,
          [ATTR.SESSION_ID]: session.id,
          'alpha.summarization.message_count': newMessageCount,
          'alpha.summarization.threshold': summaryThreshold,
        },
      },
      async (span) => {
        const result = await summarizeSession(session.id, maxContextMessages, {
          providerId: experience.providerId,
          modelId: experience.modelId,
        });
        span.setAttribute('alpha.summarization.performed', result.performed);
        if (result.performed) {
          span.setAttribute('alpha.summarization.messages_summarized', result.messagesSummarized);
          logger.info('Summarization completed', {
            sessionId: session.id,
            messagesSummarized: result.messagesSummarized,
          });
        }
      },
    ).catch((error) => {
      logger.error('Async summarization failed', error as Error, { sessionId: session.id });
    });
  }

  // 9. Emit done event
  onEvent({
    type: 'done',
    sessionId: session.id,
    usage: ctx.tokenUsage,
  });

  return {
    sessionId: session.id,
    responseText: ctx.responseText,
    usage: ctx.tokenUsage,
  };
}

// ============================================================================
// SESSION RESOLUTION
// ============================================================================

async function resolveSession(
  sessionId: string | undefined,
  experienceId: string,
  sessionConfig: SessionConfig,
) {
  const windowSize = sessionConfig.maxContextMessages ?? 20;

  // Try loading existing session
  if (sessionId) {
    const existing = await sessionsService.getSessionWithWindow(sessionId, windowSize);
    if (existing && existing.session.status === 'active') {
      return existing;
    }
    // Session not found or expired — create new
    logger.info('Session not found or expired, creating new', { sessionId, experienceId });
  }

  // Create new session
  const newSession = await sessionsService.createSession({
    aiExperienceId: experienceId,
    ttlMinutes: sessionConfig.sessionTtlMinutes ?? 1440,
  });

  return {
    session: newSession,
    messages: [],
  };
}

// ============================================================================
// EPISODIC MEMORY
// ============================================================================

/**
 * Fire-and-forget post-session memory extraction.
 * Runs after the turn completes. Wrapped in an OTel span so success/failure
 * is queryable from /analytics/traces — previously failures only surfaced in
 * stderr logs and silently degraded the product (no episodic memory) without
 * any operational signal.
 */
function triggerMemoryExtraction(
  sessionId: string,
  userId: string,
  experienceId: string,
  providerId: string | undefined,
  modelId: number | undefined,
): void {
  void withSpan(
    {
      name: 'pipeline.post.episodic_memory_extraction',
      experienceId,
      attributes: {
        [ATTR.EXPERIENCE_ID]: experienceId,
        [ATTR.SESSION_ID]: sessionId,
        'alpha.user.id': userId,
      },
    },
    async (span) => {
      const result = await extractMemoriesFromSession(sessionId, userId, experienceId, {
        providerId,
        modelId,
      });
      span.setAttribute('alpha.memory.stored', result.stored);
      span.setAttribute('alpha.memory.extracted', result.extracted);
      if (result.stored > 0) {
        logger.info('Episodic memory extraction completed', {
          sessionId, userId, stored: result.stored, extracted: result.extracted,
        });
      }
    },
  ).catch((error) => {
    // withSpan already recorded the exception on the span; this catch just
    // prevents the unhandled-rejection from crashing the dev process.
    logger.error('Async memory extraction failed', error as Error, { sessionId, userId });
  });
}

// ============================================================================
// PIPELINE CONFIG BUILDING
// ============================================================================

function buildPipelineConfig(experience: AIExperienceWithTools): PipelineConfig {
  // If experience has explicit pipeline config, use it
  if (experience.pipelineConfig) {
    return experience.pipelineConfig as PipelineConfig;
  }

  // Otherwise build the agentic default. This function is only reached from
  // _runAgenticV1; deterministic mode is routed to runV2Pipeline upstream.
  return buildDefaultAgenticPipeline(experience);
}

function buildDefaultAgenticPipeline(experience: AIExperienceWithTools): PipelineConfig {
  const guardrailConfig = experience.guardrailConfig as GuardrailConfig | null;
  const personaConfig = experience.personaConfig as PersonaConfig;
  const agenticConfig = experience.agenticConfig as AgenticConfig | null;

  const steps: PipelineStep[] = [];
  let order = 0;

  // Input guardrail (if configured)
  if (guardrailConfig?.inputGuardrail?.enabled) {
    steps.push({
      id: 'input-guardrail',
      type: 'input_guardrail',
      name: 'Input Guardrail',
      config: guardrailConfig.inputGuardrail as unknown as Record<string, unknown>,
      enabled: true,
      order: order++,
      onFailure: 'abort',
    });
  }

  // Episodic memory — retrieve cross-session user memories before the LLM call
  steps.push({
    id: 'episodic-memory',
    type: 'episodic_memory',
    name: 'Episodic Memory',
    config: {},
    enabled: true,
    order: order++,
    onFailure: 'skip',
  });

  // Agentic loop — reads maxIterations from agenticConfig, falls back to 5
  steps.push({
    id: 'agentic-loop',
    type: 'agentic_loop',
    name: 'AI Assistant',
    config: {
      maxIterations: agenticConfig?.maxIterations ?? 5,
      systemInstructions: personaConfig.systemInstructions,
      personaName: personaConfig.name,
      tone: personaConfig.tone,
      temperature: 0.7,
      maxTokens: 4096,
      providerId: experience.providerId,
      modelId: experience.modelId,
    },
    enabled: true,
    order: order++,
    onFailure: 'fallback',
  });

  // Output guardrail (if configured)
  if (guardrailConfig?.outputGuardrail?.enabled) {
    steps.push({
      id: 'output-guardrail',
      type: 'output_guardrail',
      name: 'Output Guardrail',
      config: guardrailConfig.outputGuardrail as unknown as Record<string, unknown>,
      enabled: true,
      order: order++,
      onFailure: 'skip',
    });
  }

  return {
    mode: 'agentic',
    steps,
    settings: {
      maxTotalDurationMs: 60_000,
      enableTracing: true,
      onStepFailure: 'abort',
    },
  };
}

// ============================================================================
// SHARED CONTEXT BUILDING
// ============================================================================

/**
 * Build the shared context that step handlers use for cross-step communication.
 * Pre-populates with session state, tool mappings, and data source info.
 */
function buildSharedContext(
  experience: AIExperienceWithTools,
  session: { pipelineState: unknown; lastToolResults: unknown; facts: unknown; userContext: unknown },
): Record<string, unknown> {
  // Build tool definitions and name→id mapping from experience tools
  const toolDefinitions: ToolDefinition[] = [];
  const toolNameToId: Record<string, string> = {};

  for (const assignment of experience.tools) {
    if (!assignment.isEnabled) continue;

    const tool = assignment.tool;
    if (!tool.isActive) continue;

    const toolName = tool.slug;
    const description = assignment.overrideAiDescription ?? tool.aiDescription;

    toolDefinitions.push({
      name: toolName,
      description,
      parameters: (tool.inputSchema as unknown as ToolParameterSchema) ?? {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query or input' },
        },
        required: ['query'],
      } as ToolParameterSchema,
      operation: tool.operation ?? undefined,
      executorType: tool.executorType,
      dataSourceId: tool.dataSourceId ?? null,
    });

    toolNameToId[toolName] = tool.id;

    // Set first search-type tool as the primary search tool
    const isSearchTool = tool.executorType === 'data_source' && tool.operation === 'search';
    if (isSearchTool && !toolNameToId.__searchToolId) {
      toolNameToId.__searchToolId = tool.id;
    }
  }

  // Materialize tool definitions from attached MCP connections. Each connection
  // carries a cached `discoveredTools` catalog (refreshed by /sync); we filter
  // by `enabledToolNames` (null = all) and emit synthetic tool IDs that the
  // executor will route to the MCP transport.
  for (const attachment of experience.mcpConnections ?? []) {
    if (!attachment.isEnabled) continue;
    const conn = attachment.mcpConnection;
    if (!conn.isActive) continue;
    const catalog = conn.discoveredTools;
    if (!catalog || !Array.isArray(catalog.tools)) continue;

    const allowList = attachment.enabledToolNames;
    for (const mcpTool of catalog.tools) {
      if (allowList && !allowList.includes(mcpTool.name)) continue;

      const llmName = buildLlmFacingName(conn.slug, mcpTool.name);
      const syntheticId = buildMcpToolId(conn.id, mcpTool.name);

      toolDefinitions.push({
        name: llmName,
        description: mcpTool.description ?? `${mcpTool.name} (MCP tool from ${conn.name})`,
        parameters: (mcpTool.inputSchema as unknown as ToolParameterSchema) ?? {
          type: 'object',
          properties: {},
        } as ToolParameterSchema,
        executorType: 'mcp',
        dataSourceId: null,
      });
      toolNameToId[llmName] = syntheticId;
    }
  }

  return {
    // Tool info for step handlers
    toolDefinitions,
    toolNameToId,
    searchToolId: toolNameToId.__searchToolId,

    // Restore session state from previous turns
    ...(session.pipelineState as Record<string, unknown> ?? {}),
    lastToolResults: session.lastToolResults ?? {},
    facts: session.facts ?? {},

    // User identity for episodic memory retrieval
    userContext: session.userContext ?? null,

    // Conversation state (populated by step handlers during execution)
    hasResults: false,
    resultCount: 0,
    currentResults: [],
    currentQuery: undefined,
    activeConstraints: [],
  };
}

// ============================================================================
// GUARDRAIL EVALUATION (shared between V1 step handlers and V2 wrapper)
// ============================================================================

interface GuardrailRule {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  action: 'block' | 'warn' | 'redact' | 'reroute';
  enabled: boolean;
  priority: number;
}

/**
 * Evaluate output guardrail rules. Returns block/redact result.
 */
function evaluateOutputGuardrailRules(
  rules: GuardrailRule[],
  text: string,
): { blocked: boolean; redactedText?: string } {
  const enabledRules = rules
    .filter(r => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  let currentText = text;

  for (const rule of enabledRules) {
    if (rule.action === 'block' && evaluateRule(rule, currentText)) {
      return { blocked: true };
    }
    if (rule.action === 'redact') {
      const redacted = tryRedact(rule, currentText);
      if (redacted !== null) {
        currentText = redacted;
      }
    }
  }

  if (currentText !== text) {
    return { blocked: false, redactedText: currentText };
  }
  return { blocked: false };
}

function evaluateRule(rule: GuardrailRule, text: string): boolean {
  switch (rule.type) {
    case 'blocklist': {
      const terms = rule.config.terms as string[] | undefined;
      if (!terms?.length) return false;
      const lower = text.toLowerCase();
      return terms.some(t => lower.includes(t.toLowerCase()));
    }
    case 'max_length': {
      const maxChars = rule.config.maxChars as number | undefined;
      if (!maxChars) return false;
      return text.length > maxChars;
    }
    case 'regex_filter': {
      const pattern = rule.config.pattern as string | undefined;
      if (!pattern) return false;
      try {
        const flags = (rule.config.flags as string) ?? 'i';
        return new RegExp(pattern, flags).test(text);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

function tryRedact(rule: GuardrailRule, text: string): string | null {
  switch (rule.type) {
    case 'max_length': {
      const maxChars = rule.config.maxChars as number | undefined;
      if (!maxChars || text.length <= maxChars) return null;
      return text.slice(0, maxChars) + '...';
    }
    case 'regex_filter': {
      const pattern = rule.config.pattern as string | undefined;
      if (!pattern) return null;
      try {
        const flags = (rule.config.flags as string) ?? 'gi';
        const replacement = (rule.config.replacement as string) ?? '[REDACTED]';
        const regex = new RegExp(pattern, flags);
        if (!regex.test(text)) return null;
        return text.replace(regex, replacement);
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}
