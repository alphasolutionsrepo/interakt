// src/features/pipeline/v2/turn-planner.ts

/**
 * D1: Turn Planner — Deterministic Pipeline V2
 *
 * Given the full conversation context and available tools, produces an ordered
 * plan of actions for this turn. This is the ONLY step where the AI reasons
 * about what to do. All subsequent steps execute the plan — they don't re-decide.
 *
 * AI calls: 1 (the planning call)
 *
 * Dependencies are injected for testability:
 * - chatFn: makes the AI call (real: ai-service chat(), test: mock)
 *
 * See: docs/platform-evolution/DETERMINISTIC-PIPELINE-V2.md § D1
 */

import { createLogger } from '@/shared/logger/logger';
import type {
  TurnPlannerInput,
  TurnPlan,
  ToolSummary,
  ModuleResult,
} from './v2.types';
import type { ChatMessage, ChatResult, ChatOptions, ResponseFormat } from '@/features/ai-service/ai-service.types';

const logger = createLogger('v2:turn-planner');

// ============================================================================
// DEPENDENCY INTERFACES
// ============================================================================

/**
 * AI chat function signature — matches the real `chat()` from ai-service.
 * Injected so tests can provide a mock without importing the entire AI stack.
 */
export type ChatFn = (
  messages: ChatMessage[],
  options?: ChatOptions,
) => Promise<ChatResult>;

export interface TurnPlannerDeps {
  chat: ChatFn;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface TurnPlannerConfig {
  /** AI provider ID (passed through to chat) */
  providerId?: string;
  /** AI model ID (passed through to chat) */
  modelId?: number;
  /** Temperature for the planning call (default: 0.1 — low for consistency) */
  temperature: number;
  /** Max tokens for the planning response (default: 800) */
  maxTokens: number;
}

const DEFAULT_CONFIG: TurnPlannerConfig = {
  temperature: 0.1,
  maxTokens: 800,
};

// ============================================================================
// RESPONSE SCHEMA (OpenAI strict-compatible)
// ============================================================================

/**
 * The JSON schema for the planner's response.
 * All properties have explicit types, additionalProperties: false everywhere.
 * `hints` is type: "string" (JSON-encoded) to avoid the dynamic-object problem.
 */
const TURN_PLAN_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'turn_plan',
    description: 'An ordered plan of actions for this conversation turn',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              toolSlug: { type: 'string' },
              intent: { type: 'string' },
              hints: { type: 'string' },
              dependsOnPrevious: { type: 'boolean' },
            },
            required: ['toolSlug', 'intent', 'hints', 'dependsOnPrevious'],
            additionalProperties: false,
          },
        },
        reasoning: { type: 'string' },
        directResponse: { type: 'boolean' },
        needsClarification: { type: 'boolean' },
        clarificationQuestion: { type: ['string', 'null'] },
        confidence: { type: 'number' },
      },
      required: [
        'actions',
        'reasoning',
        'directResponse',
        'needsClarification',
        'clarificationQuestion',
        'confidence',
      ],
      additionalProperties: false,
    },
  },
};

// ============================================================================
// MODULE ENTRY POINT
// ============================================================================

/**
 * Plan the actions for a conversation turn.
 *
 * Calls the AI once with the full conversation context and available tools.
 * Returns a validated TurnPlan that the Execution Loop (D2) will execute.
 */
export async function planTurn(
  input: TurnPlannerInput,
  deps: TurnPlannerDeps,
  config: Partial<TurnPlannerConfig> = {},
): Promise<ModuleResult<TurnPlan>> {
  const startTime = Date.now();
  const cfg = { ...DEFAULT_CONFIG, ...config };

  try {
    // 1. Build prompt messages
    const messages = await buildMessages(input);

    // 2. Call AI
    const aiResult = await deps.chat(messages, {
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      providerId: cfg.providerId,
      modelId: cfg.modelId,
      responseFormat: TURN_PLAN_RESPONSE_FORMAT,
      feature: 'turn-planner',
    });

    // 3. Parse response
    const content = typeof aiResult.message.content === 'string'
      ? aiResult.message.content
      : '';
    const rawPlan = JSON.parse(content) as RawTurnPlan;

    // 4. Transform hints from JSON strings to objects
    const plan = transformPlan(rawPlan);

    // 4b. Auto-fix contradictory flags: if actions are present, the AI intended
    // to use tools — override directResponse to false rather than rejecting the plan
    if (plan.directResponse && plan.actions.length > 0) {
      logger.info('Auto-corrected directResponse=true with non-empty actions');
      plan.directResponse = false;
    }

    // 5. Validate plan against available tools
    const validationErrors = validatePlan(plan, input.availableTools);
    if (validationErrors.length > 0) {
      const durationMs = Date.now() - startTime;
      logger.warn('Plan validation failed', {
        errors: validationErrors,
        plan,
      });

      return {
        success: false,
        summary: `Plan validation failed: ${validationErrors.join('; ')}`,
        durationMs,
      };
    }

    const durationMs = Date.now() - startTime;

    logger.info('Turn planned', {
      actionCount: plan.actions.length,
      directResponse: plan.directResponse,
      needsClarification: plan.needsClarification,
      confidence: plan.confidence,
      reasoning: plan.reasoning,
      durationMs,
    });

    return {
      success: true,
      data: plan,
      summary: plan.directResponse
        ? 'Direct response (no actions needed)'
        : plan.needsClarification
          ? 'Needs clarification from user'
          : `Planned ${plan.actions.length} action(s): ${plan.actions.map(a => a.toolSlug).join(', ')}`,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Turn planning failed', err);

    return {
      success: false,
      summary: `Turn planning failed: ${err.message}`,
      durationMs,
    };
  }
}

// ============================================================================
// RAW AI RESPONSE TYPE (before hints transformation)
// ============================================================================

interface RawTurnPlan {
  actions: Array<{
    toolSlug: string;
    intent: string;
    hints: string; // JSON-encoded string from AI
    dependsOnPrevious: boolean;
  }>;
  reasoning: string;
  directResponse: boolean;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  confidence: number;
}

// ============================================================================
// PLAN TRANSFORMATION
// ============================================================================

/**
 * Parse JSON-encoded `hints` strings into objects.
 * If parsing fails, fall back to empty hints — don't fail the whole plan.
 */
function transformPlan(raw: RawTurnPlan): TurnPlan {
  return {
    ...raw,
    actions: raw.actions.map((action) => ({
      toolSlug: action.toolSlug,
      intent: action.intent,
      dependsOnPrevious: action.dependsOnPrevious,
      hints: parseHints(action.hints),
    })),
  };
}

function parseHints(hintsStr: string): Record<string, unknown> {
  if (!hintsStr || hintsStr.trim() === '') return {};
  try {
    const parsed = JSON.parse(hintsStr);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    // AI may produce non-JSON hints — treat as a free-form description
    return { _raw: hintsStr };
  }
}

// ============================================================================
// PLAN VALIDATION
// ============================================================================

/**
 * Validate the AI's plan against the available tools.
 * Returns an array of error strings (empty = valid).
 */
function validatePlan(plan: TurnPlan, availableTools: ToolSummary[]): string[] {
  const errors: string[] = [];
  const toolSlugs = new Set(availableTools.map(t => t.slug));

  // directResponse=true → actions must be empty
  if (plan.directResponse && plan.actions.length > 0) {
    errors.push('directResponse=true but actions array is not empty');
  }

  // needsClarification=true → clarificationQuestion must be present
  if (plan.needsClarification && !plan.clarificationQuestion) {
    errors.push('needsClarification=true but clarificationQuestion is empty');
  }

  // Every toolSlug must exist in available tools
  for (const action of plan.actions) {
    if (!toolSlugs.has(action.toolSlug)) {
      errors.push(`Unknown tool slug: "${action.toolSlug}". Available: ${[...toolSlugs].join(', ')}`);
    }
  }

  // Confidence must be in [0, 1]
  if (plan.confidence < 0 || plan.confidence > 1) {
    errors.push(`Confidence ${plan.confidence} is out of range [0, 1]`);
  }

  return errors;
}

// Exported for testing
export { validatePlan as _validatePlan };

// ============================================================================
// PROMPT BUILDING
// ============================================================================

async function buildMessages(input: TurnPlannerInput): Promise<ChatMessage[]> {
  const systemPrompt = await buildSystemPrompt(input, input.experienceId);
  const userPrompt = buildUserPrompt(input);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // When no turn log exists (older sessions), fall back to raw conversation history
  if (input.turnLog.length === 0 && input.conversationHistory.length > 0) {
    for (const msg of input.conversationHistory) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }
  }

  // Current user message as the final message (turn log is included in it)
  messages.push({ role: 'user', content: userPrompt });

  return messages;
}

async function buildSystemPrompt(input: TurnPlannerInput, experienceId?: string): Promise<string> {
  const toolList = input.availableTools
    .map((t) => `- **${t.slug}**: ${t.description}`)
    .join('\n');

  const personaBlock = buildPersonaBlock(input);
  const dataContextBlock = input.dataContext ?? '';

  // Try DB-backed template first
  try {
    const { resolveTemplate, renderTemplate } = await import('@/features/prompt-templates');
    const template = await resolveTemplate('turn_planner', experienceId);
    if (template) {
      const rendered = renderTemplate(template.content, {
        toolList,
        businessDomain: input.businessDomain ?? '',
        // Both are self-contained blocks (heading included, empty string when
        // not applicable), so a template that places them renders identically
        // to the inline fallback that appends them.
        personaInstructions: personaBlock,
        toolWorkflow: buildToolWorkflow(input.availableTools, dataContextBlock !== ''),
        dataContext: dataContextBlock,
      });
      // A template that already places {{personaInstructions}} itself owns the
      // placement; otherwise append, so enabling the policy flag works with the
      // stock template and with custom ones that predate the variable.
      const withWorkflow = template.content.includes('toolWorkflow')
        ? rendered
        : rendered + buildToolWorkflow(input.availableTools, dataContextBlock !== '');
      const withPersona = template.content.includes('personaInstructions')
        ? withWorkflow
        : withWorkflow + personaBlock;
      // A custom template written before this variable existed still gets the field facts
      // appended — otherwise upgrading the platform would silently withhold them from
      // exactly the experiences that were customized because planning needed help.
      return template.content.includes('dataContext') || dataContextBlock === ''
        ? withPersona
        : `${withPersona}\n\n${dataContextBlock}`;
    }
  } catch {
    // Template system not available (no DB, not seeded) — fall through to inline
  }

  // Fallback: inline prompt (identical to v1 template content)
  let prompt = `You are a turn planner for an AI assistant.

## Your job
Analyze the user's message in the context of the conversation and decide
what actions to take using the available tools.

## Available tools
${toolList}

## Rules
1. Select tool(s) from the available list. Use exact tool slugs.
2. Order actions logically — if action 2 needs results from action 1, mark dependsOnPrevious=true.
3. For greetings, "thank you", "what can you do?" → set directResponse=true, empty actions.
4. Only set needsClarification=true when the request is truly ambiguous and you cannot
   make a reasonable guess. If the user mentions a product category, topic, or keyword,
   ALWAYS search for it — do NOT ask for clarification. Prefer action over clarification.
5. Provide rough parameter hints in the hints field as a JSON string.
   These are NOT final parameters — just your understanding of what the user wants.
   Hints MUST match what the user actually asked for. Do not invert or change the meaning
   (e.g., if the user says "max $200", hints should reflect a maximum price of 200, not above 200).
   Only use parameter names that appear in the tool descriptions above — do NOT invent field names.
6. When the user references previous results ("item 2", "that shirt", "the red one"),
   resolve from the visible results below and include the resolved ID in hints.
7. Confidence: 0.9+ for clear requests, 0.7-0.89 for likely correct, below 0.7 for unclear.
8. When the user says "yes", "show me those", or similar confirmations referencing previous
   results or suggestions, use the SAME parameters/filters from the previous turn — do not change them.
9. For filter hints, prefer the fields and values described under "The data you can query"
   below, when it is present. Where a field lists its observed values, use one of them
   exactly. Where a field is reported as empty in most documents, do not rely on it.
   Put topical or descriptive wording in a text search rather than a filter.
   If no field information is given, use common attribute names (e.g., category: "jackets")
   and the backend will resolve them where it can.`;

  if (input.businessDomain) {
    prompt += `\n\n## Business domain\n${input.businessDomain}`;
  }

  if (dataContextBlock) {
    prompt += `\n\n${dataContextBlock}`;
  }

  return prompt + buildToolWorkflow(input.availableTools, dataContextBlock !== '') + buildPersonaBlock(input);
}

/**
 * Operation-aware guidance on how to sequence the available tools.
 *
 * Ported from the retired agentic loop, which was the only path that had it —
 * the planner previously received a flat tool list with no advice on ordering.
 * Two fixes applied while porting:
 *
 *  - The original keyed *every* branch on `operation`, so an experience whose
 *    tools are all standalone (http / mcp / ai_call, which have no operation)
 *    matched no branch at all and silently received no guidance. Standalone
 *    tools now get their own line.
 *  - Guidance is scoped to what actually exists, so an experience without an
 *    enumerate tool is never told to discover filter values it cannot reach.
 *
 * This is a stopgap shaped like the data: the durable version derives sequencing
 * from the data source's field profile and provider capabilities rather than
 * from operation names.
 */
function buildToolWorkflow(tools: ToolSummary[], knowsTheSchema: boolean): string {
  if (tools.length === 0) return '';

  const byOperation = (op: string) => tools.find((t) => t.operation === op);
  const inspect = byOperation('inspect');
  const enumerate = byOperation('enumerate');
  const search = tools.find((t) => t.operation === 'search' || t.operation === 'query');
  const lookup = byOperation('lookup');
  const standalone = tools.filter((t) => !t.operation);

  const lines: string[] = ['## Sequencing your tools'];

  // The discovery preamble — inspect, then enumerate, then search — was written when the
  // planner was told nothing about the index. It is the wrong advice once the prompt already
  // carries field capabilities and observed values: every turn opened with an enumerate that
  // returned nothing useful, spending an LLM call and a query to learn what it had just been
  // told. Observed live, repeatedly.
  if (knowsTheSchema && search) {
    lines.push(
      `Start with \`${search.slug}\`, using terms extracted from the user's intent rather than`
      + ' their raw sentence. The field list above already gives you each field\'s capabilities'
      + ' and the values seen in the data, so you do not need a discovery step to find them.',
    );
    if (enumerate) {
      lines.push(
        `Use \`${enumerate.slug}\` only when the value you need is genuinely not in that list —`
        + ' for example the user names something no listed value resembles, or the field was'
        + ' shown as too varied to enumerate. Never invent a filter value.',
      );
    }
    if (inspect) {
      lines.push(`Use \`${inspect.slug}\` only if you need a field that was not listed above.`);
    }
  } else if (inspect || enumerate) {
    lines.push('For a new topic, prefer this order:');
    let step = 1;
    if (inspect) {
      lines.push(`${step++}. \`${inspect.slug}\` — learn the available fields and filter options.`);
    }
    if (enumerate) {
      lines.push(`${step++}. \`${enumerate.slug}\` — get the valid values for a field before filtering on it. Never invent a filter value.`);
    }
    if (search) {
      lines.push(`${step++}. \`${search.slug}\` — search with terms extracted from the user's intent, not their raw sentence.`);
    }
  } else if (search) {
    lines.push(`Use \`${search.slug}\` with terms extracted from the user's intent, not their raw sentence.`);
  }

  if (lookup) {
    lines.push(`Use \`${lookup.slug}\` only when you already have a specific record id.`);
  }
  if (standalone.length > 0) {
    lines.push(
      `These tools act directly and are not part of a discovery sequence: ${standalone.map((t) => `\`${t.slug}\``).join(', ')}.`,
    );
  }

  lines.push('Never fabricate information a tool could provide — call the tool instead.');

  return `\n\n${lines.join('\n')}`;
}

/**
 * Persona instructions reach planning only when the policy opts in.
 *
 * The field has always been threaded into TurnPlannerInput and then dropped, so
 * an operator writing "always search before answering" saw it obeyed in the
 * agentic path and silently ignored here. Keeping it behind a flag makes that a
 * deliberate per-experience choice instead of an accident, and leaves default
 * behavior unchanged.
 */
function buildPersonaBlock(input: TurnPlannerInput): string {
  if (!input.includePersona) return '';
  const instructions = input.personaInstructions?.trim();
  if (!instructions) return '';
  return (
    '\n\n## Assistant instructions\n' +
    'These govern how this assistant behaves. Respect any constraints they place on ' +
    'which tools to use and when.\n' +
    instructions
  );
}

function buildUserPrompt(input: TurnPlannerInput): string {
  const parts: string[] = [];

  // Structured turn log (compact action history from previous turns)
  if (input.turnLog.length > 0) {
    const turnLines = input.turnLog
      .map((t) => {
        const toolsPart = t.toolsUsed.length > 0
          ? t.toolsUsed.map((u) => {
              const parts = [`${u.slug}`, `intent: "${u.intent}"`];
              if (u.query) parts.push(`query: "${u.query}"`);
              parts.push(u.success ? `${u.resultsReturned ?? '?'} results` : 'failed');
              return parts.join(' → ');
            }).join(', ')
          : t.decision === 'clarification' ? 'asked for clarification' : 'responded directly';
        return `- Turn ${t.turnIndex}: "${t.userMessage}" → ${toolsPart}`;
      })
      .join('\n');
    parts.push(`## Previous turns\n${turnLines}`);
  }

  // Conversation summary (compressed older history, supplements turn log for long sessions)
  if (input.conversationSummary) {
    parts.push(`## Conversation summary\n${input.conversationSummary}`);
  }

  // Session facts
  if (Object.keys(input.sessionFacts).length > 0) {
    const factLines = Object.entries(input.sessionFacts)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');
    parts.push(`## Session facts\n${factLines}`);
  }

  // Result memory (visible results the user might reference)
  if (input.resultMemoryIndex.length > 0) {
    const resultLines = input.resultMemoryIndex
      .map((entry) => {
        const snapshot = Object.entries(entry.snapshot)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        return `- Item ${entry.ordinal}: ${snapshot} [id=${entry.resultId}]`;
      })
      .join('\n');
    parts.push(`## Currently visible results\n${resultLines}`);
  }

  // Episodic memories
  if (input.episodicMemories.length > 0) {
    const memLines = input.episodicMemories.map((m) => `- ${m}`).join('\n');
    parts.push(`## Relevant user history\n${memLines}`);
  }

  // Earlier rounds in THIS turn — only present when re-planning. Placed last
  // before the user message so it is the most recent context the model reads.
  if (input.previousRounds?.length) {
    const roundLines = input.previousRounds
      .map((r) => {
        const attempts = r.attempts
          .map((a) => {
            const bits = [a.toolSlug, `intent: "${a.intent}"`];
            if (a.query) bits.push(`query: "${a.query}"`);
            bits.push(a.success ? `${a.resultCount} results` : `failed${a.error ? `: ${a.error}` : ''}`);
            return bits.join(' → ');
          })
          .join(', ');
        return `- Attempt ${r.round}: ${attempts || 'nothing executed'} (${r.reason})`;
      })
      .join('\n');

    // Tools that errored are called out separately and emphatically. Observed
    // behavior: told only "do not repeat an attempt above", the model re-planned
    // the *same* failing tool and burned a second round on it. A tool that
    // errored will error again — it is unavailable, not merely unproductive.
    const brokenTools = [
      ...new Set(
        input.previousRounds
          .flatMap((r) => r.attempts)
          .filter((a) => !a.success)
          .map((a) => a.toolSlug),
      ),
    ];

    let guidance =
      'These did not produce a usable answer. Plan something DIFFERENT — a different tool, ' +
      'a broader or reworded keyphrase, or fewer filters. Never repeat an attempt listed above.';

    if (brokenTools.length > 0) {
      guidance +=
        `\n\nThese tools returned an ERROR and are unavailable for the rest of this turn — ` +
        `do not call them again under any circumstances: ${brokenTools.map((t) => `\`${t}\``).join(', ')}. ` +
        'Achieve the goal with the remaining tools, or explain that you cannot.';
    }

    parts.push(`## Attempts already made this turn\n${roundLines}\n\n${guidance}`);
  }

  // The actual user message
  parts.push(`## User message\n${input.userMessage}`);

  return parts.join('\n\n');
}

// Exported for testing
export { buildSystemPrompt as _buildSystemPrompt, buildUserPrompt as _buildUserPrompt };

// ============================================================================
// PRODUCTION DEPENDENCY FACTORY
// ============================================================================

/**
 * Create TurnPlannerDeps backed by the real AI service.
 * Import this in the pipeline orchestrator, not in tests.
 */
export function createProductionTurnPlannerDeps(): TurnPlannerDeps {
  return {
    async chat(messages, options) {
      const { chat } = await import('@/features/ai-service/ai-service.service');
      return chat(messages, options);
    },
  };
}
