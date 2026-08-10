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

import type { SessionConfig, PersonaConfig, GuardrailConfig } from '@/db/schema';
import type { AIExperienceWithTools } from '@/features/ai-experience/ai-experience.types';
import { guardrailDecision, resolveExecutionPolicy, type ExecutionPolicy } from '@/features/ai-experience/execution-policy';
import type { ClassificationResult } from '@/features/guardrails/message-classification.types';
import { classifyMessage } from '@/features/guardrails/message-classifier';
import { withAnalyticsSource } from '@/features/search/search.service';
import { withSpan } from '@/features/telemetry';
import { ATTR } from '@/features/telemetry/attribute-keys';

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
 * persona instructions reach planning. Guardrails wrap the engine here (S1 in,
 * S3 out) rather than living inside it, so they apply identically under any
 * policy.
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
    {
      // One engine, policy decides autonomy. `pipelineMode` selects the preset
      // (deterministic → Standard, agentic → Thorough) and `executionPolicy`
      // applies per-experience overrides on top.
      policy,
      maxTotalDurationMs: policy.maxTurnDurationMs,
    },
  );

  // ── S3: Output Guardrail ─────────────────────────────────────────────
  let responseText = result.responseText;

  // Same lock as the input side: a locked experience applies the configured output rules
  // whether or not the stage is switched on.
  const outputRules = (guardrailConfig?.outputGuardrail?.rules ?? []) as unknown[];
  const outputDecision = guardrailDecision(
    guardrailConfig?.enforced === true,
    guardrailConfig?.outputGuardrail,
  );

  if (outputDecision.run && responseText) {
    const outputResult = evaluateOutputGuardrailRules(
      guardrailConfig!.outputGuardrail.rules ?? [],
      responseText,
    );
    if (outputResult.blocked) {
      responseText = guardrailConfig!.outputGuardrail.onBlock?.message
        ?? 'The response was blocked by content policy.';
    } else if (outputResult.redactedText) {
      responseText = outputResult.redactedText;
    }
  }

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
    responseText,
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
