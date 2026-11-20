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

import type {
  PipelineMode,
  PipelineStreamEvent,
} from './pipeline.types';
import { runV2Pipeline, createProductionV2Deps } from './v2';
import { synthesizeLightweightResponse, createProductionSynthesisDeps } from './v2/response-synthesis';
import { chatUntilAbandoned, stopIfAbandoned } from './turn-abandoned';

import type { SessionConfig, PersonaConfig, GuardrailConfig } from '@/db/schema';
import type { AIExperienceWithTools } from '@/features/ai-experience/ai-experience.types';
import { guardrailDecision, resolveExecutionPolicy, type ExecutionPolicy } from '@/features/ai-experience/execution-policy';
import type { ClassificationResult } from '@/features/guardrails/message-classification.types';
import { classifyMessage } from '@/features/guardrails/message-classifier';
import { withAnalyticsSource } from '@/features/analytics/analytics-source-context';
import { withSpan } from '@/features/telemetry';
import { ATTR } from '@/features/telemetry/attribute-keys';
import { applyOutputGuardrail, DEFAULT_OUTPUT_BLOCK_MESSAGE, outputGuardrailDecision } from '@/features/guardrails/output-guardrail';

import * as sessionsService from '@/features/sessions/sessions.service';
import type { TopicGateRuleConfig } from '@/features/guardrails/topic-gate.service';


import { createLogger } from '@/shared/logger/logger';

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
  /** Aborted when the visitor closes the chat: the turn stops before its next step (TurnAbandonedError) */
  signal?: AbortSignal;
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
        [ATTR.ANALYTICS_SOURCE]: input.analyticsSource ?? 'api',
      },
    },
    () => withAnalyticsSource(input.analyticsSource ?? 'api', () => _runChatPipeline(input)),
  );
}

async function _runChatPipeline(input: ChatPipelineInput): Promise<ChatPipelineResult> {
  // One engine for both modes.
  //
  // `pipelineMode` no longer selects an implementation — it selects an execution
  // *budget* preset (deterministic → Standard, agentic → Thorough), and the
  // unified Plan-Execute-Assess-Synthesize pipeline honors it. Previously the
  // two modes ran on separate engines with divergent prompt assembly, so the
  // same tools and persona produced different behavior depending on the mode,
  // and every capability had to be built twice.
  return _runUnifiedPipeline(input);
}

/**
 * Run the unified chat pipeline (Plan-Execute-Assess-Synthesize).
 *
 * Serves every budget preset: the resolved ExecutionPolicy
 * decides how many planning rounds are permitted, the tool ceiling, and whether
 * persona instructions reach planning. The input rules run here before the
 * engine. The output rules are built here as one filter and applied to every
 * AI-written answer before it is streamed or saved (inside the engine's
 * synthesis step, and on the greeting / off-topic short-circuit below), so they
 * apply identically under any policy.
 */
async function _runUnifiedPipeline(input: ChatPipelineInput): Promise<ChatPipelineResult> {
  const { experience, message, onEvent } = input;
  const emptyUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  // ── S1: Input Guardrail + Message Classification ────────────────────
  const guardrailConfig = experience.guardrailConfig as GuardrailConfig | null;
  const personaConfig = experience.personaConfig as PersonaConfig;
  const sessionConfig = experience.sessionConfig as SessionConfig;

  // Resolve the execution policy once per turn: preset from pipelineMode, then
  // per-experience overrides. Used by the guardrail decision below and passed
  // into the engine.
  const policy = resolveExecutionPolicy(
    experience.pipelineMode,
    experience.executionPolicy as Partial<ExecutionPolicy> | null,
  );

  // `guardrailConfig.enforced` is the compliance lock: the configured rules run whether or
  // not the experience has a side switched on. Without it the stages keyed off the enabled
  // flags alone, so an operator could switch them off and the turn would run unguarded
  // while still reporting itself as governed.
  //
  // It is read from the guardrail config rather than the execution policy because it is not
  // a budget — every remaining policy axis meters tokens or seconds, and this meters
  // nothing. See GuardrailConfig.enforced.
  //
  // Rules that do not exist cannot be enforced. That case is recorded on the trace rather
  // than passed over in silence, because "locked with nothing configured" is a
  // misconfiguration an operator needs told about.
  const guardrailsEnforced = guardrailConfig?.enforced === true;

  // Output rules: one filter for the turn, applied to AI-written text before it is
  // streamed or saved. Without a stage to run it returns the text as is.
  const outputDecision = outputGuardrailDecision(guardrailConfig);
  const filterOutput = async (text: string): Promise<string> => {
    if (!outputDecision.run || !text) return text;
    return withSpan(
      {
        name: 'pipeline.v2.output_guardrail',
        experienceId: experience.id,
        attributes: { [ATTR.PIPELINE_PHASE]: 'output_guardrail' },
      },
      async (span) => {
        const result = applyOutputGuardrail(guardrailConfig, text);
        span.setAttribute('alpha.v2.guardrail.output_outcome', result.outcome);
        span.setAttribute('alpha.v2.guardrail.output_fired_rules', result.firedRules.join(', '));
        span.setAttribute('alpha.v2.guardrail.forced_by_policy', result.forcedByPolicy);
        return result.text;
      },
    );
  };
  const inputRules = (guardrailConfig?.inputGuardrail?.rules ?? []) as unknown[];
  const inputDecision = guardrailDecision(guardrailsEnforced, guardrailConfig?.inputGuardrail);
  const inputForcedByPolicy = inputDecision.forcedByPolicy;
  const runInputGuardrail = inputDecision.run;

  let classification: ClassificationResult | null = null;

  if (runInputGuardrail) {
    // Debug: log actual domainFilterEnabled value to diagnose caching issues
    const tgRule = ((guardrailConfig!.inputGuardrail.rules ?? []) as Array<{ type: string; config: Record<string, unknown> }>)
      .find((r) => r.type === 'topic_gate');
    logger.info('Guardrail config loaded', {
      experienceId: experience.id,
      domainFilterEnabled: tgRule?.config?.domainFilterEnabled ?? 'no-topic-gate-rule',
      rulesCount: (guardrailConfig!.inputGuardrail.rules as unknown[])?.length ?? 0,
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
        const rules = guardrailConfig!.inputGuardrail.rules ?? [];
        const enabledRules = rules.filter((r: any) => r.enabled);
        span.setAttribute('alpha.v2.guardrail.rules_count', enabledRules.length);
        // Records that the policy overrode a disabled config, so an audit can tell an
        // intentional guardrail from one the policy insisted on.
        span.setAttribute('alpha.v2.guardrail.forced_by_policy', inputForcedByPolicy);

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
          blockMessage: guardrailConfig!.inputGuardrail.onBlock?.message
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
      stopIfAbandoned(input.signal, 'writing the answer');

      // Lightweight AI synthesis with persona tone (wrapped in its own span). The visitor
      // leaving aborts it mid-call.
      const synthDeps = { chat: chatUntilAbandoned(createProductionSynthesisDeps().chat, input.signal) };
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
          // Output rules apply to this reply too, before it is traced, saved or sent
          // A filter that fails sends the block message, never the unchecked text
          let safeText: string;
          try {
            safeText = await filterOutput(text);
          } catch (error) {
            logger.error('Output filter failed on short-circuit reply', error as Error, {
              experienceId: experience.id,
            });
            safeText = guardrailConfig?.outputGuardrail?.onBlock?.message ?? DEFAULT_OUTPUT_BLOCK_MESSAGE;
          }
          synthSpan.setAttribute('alpha.v2.guardrail.response_length', safeText.length);
          synthSpan.setAttribute('alpha.v2.guardrail.response_text', safeText.length > 2000 ? safeText.slice(0, 2000) + '…' : safeText);
          return safeText;
        },
      );

      // Persist user + assistant messages, unless the visitor has left. The session is
      // resolved (or created) only now, so a turn that isn't saved leaves no empty one.
      stopIfAbandoned(input.signal, 'saving the turn');
      const { session } = await resolveSession(
        input.sessionId,
        experience.id,
        sessionConfig,
      );
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
  // The experience's model reaches every AI call through the turn context below.
  const deps = createProductionV2Deps();

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
      signal: input.signal,
      filterOutput,
    },
    deps,
    {
      // One engine, policy decides autonomy. `pipelineMode` selects the preset
      // (deterministic → Standard, agentic → Thorough) and `executionPolicy`
      // applies per-experience overrides on top.
      policy,
      maxTotalDurationMs: policy.maxTurnDurationMs,
    },
  );

  const outputRules = (guardrailConfig?.outputGuardrail?.rules ?? []) as unknown[];

  // Guardrails locked on with no rules at all is a misconfiguration: the experience claims
  // enforcement and there is nothing to enforce. Warn rather than let it carry a promise with
  // no evidence behind it.
  if (guardrailsEnforced && inputRules.length === 0 && outputRules.length === 0) {
    logger.warn('Guardrails are locked on but no rules are configured', {
      experienceId: experience.id,
      pipelineMode: experience.pipelineMode,
    });
  }

  return {
    sessionId: result.sessionId,
    responseText: result.responseText,
    usage: result.usage,
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
    const existing = await sessionsService.getSessionWithWindow(sessionId, windowSize, experienceId);
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
