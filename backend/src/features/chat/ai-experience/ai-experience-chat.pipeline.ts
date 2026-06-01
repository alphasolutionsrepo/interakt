// src/features/chat/ai-experience/ai-experience-chat.pipeline.ts
//
// Agentic chat pipeline for AI Experiences.
//
// Flow:
//   1. Build tool definitions from the experience's assigned tools
//   2. Build system prompt from persona + custom instructions
//   3. AI Call #1 — streamChat with tools
//   4. If LLM calls tool(s) → executeTool() → feed results back
//   5. AI Call #2 — streamChat without tools → final response
//   6. Persist turn in in-memory session
//
// Session storage is intentionally in-memory for simplicity.
// Sessions expire after SESSION_TTL_MS of inactivity.

import { v4 as uuidv4 } from 'uuid';
import { streamChat } from '@/features/ai-service/ai-service.service';
import { executeTool, EXECUTOR_INPUT_SCHEMAS } from '@/features/tools/tools.executor';
import type {
  ChatMessage,
  ToolDefinition,
  ToolUseBlock,
  TokenUsage,
  ToolParameterSchema,
} from '@/features/ai-service/ai-service.types';
import type { AIExperienceWithTools } from '@/features/ai-experience/ai-experience.types';
import { ATTR } from '@/features/telemetry';
import { traceAIExperienceTurn, traceToolExecution } from './ai-experience.tracing';

// ============================================================================
// SESSION STORE
// ============================================================================

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_SESSIONS = 1000; // prevent unbounded growth

interface AgenticSession {
  messages: ChatMessage[];
  experienceId: string;
  lastActive: Date;
}

const sessions = new Map<string, AgenticSession>();

function pruneSessions() {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.lastActive.getTime() > SESSION_TTL_MS) {
      sessions.delete(key);
    }
  }
  // If still over limit, evict oldest entries
  if (sessions.size > MAX_SESSIONS) {
    const sorted = [...sessions.entries()].sort(
      ([, a], [, b]) => a.lastActive.getTime() - b.lastActive.getTime(),
    );
    const toDelete = sorted.slice(0, sessions.size - MAX_SESSIONS);
    for (const [key] of toDelete) sessions.delete(key);
  }
}

export function generateSessionId(): string {
  return uuidv4();
}

export function getOrCreateSession(
  sessionId: string,
  experienceId: string,
): AgenticSession {
  pruneSessions();
  let session = sessions.get(sessionId);
  // Invalidate if experience changed (e.g., new session reused old id)
  if (!session || session.experienceId !== experienceId) {
    session = { messages: [], experienceId, lastActive: new Date() };
    sessions.set(sessionId, session);
  }
  return session;
}

// ============================================================================
// PIPELINE EVENTS
// ============================================================================

export type AgenticPipelineEvent =
  | { type: 'content'; content: string }
  | { type: 'tool_call'; id: string; name: string; displayName: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; displayName: string; success: boolean; durationMs: number }
  | { type: 'error'; message: string }
  | { type: 'done'; sessionId: string; usage?: TokenUsage };

// ============================================================================
// HELPERS
// ============================================================================

function buildSystemPrompt(experience: AIExperienceWithTools): string {
  const parts: string[] = [];
  const persona = experience.personaConfig;

  // ── 1. Core identity ──────────────────────────────────────────────────────
  const assistantName = persona?.name?.trim();
  if (persona?.systemInstructions?.trim()) {
    parts.push(persona.systemInstructions.trim());
  } else if (assistantName) {
    parts.push(`You are ${assistantName}, a helpful AI assistant.`);
  } else {
    parts.push('You are a helpful AI assistant.');
  }

  // ── 2. Tone ───────────────────────────────────────────────────────────────
  const toneGuide: Record<string, string> = {
    professional: 'Maintain a professional, clear, and authoritative tone.',
    friendly: 'Be warm, approachable, and conversational.',
    casual: 'Keep your tone relaxed and informal.',
    enthusiastic: 'Be upbeat, energetic, and encouraging.',
    concise: 'Be brief and to the point. Avoid unnecessary detail.',
  };
  if (persona?.tone && toneGuide[persona.tone]) {
    parts.push(toneGuide[persona.tone]);
  }

  // ── 3. Tool awareness ─────────────────────────────────────────────────────
  const activeTools = experience.tools
    .filter((a) => a.isEnabled && a.tool.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (activeTools.length > 0) {
    const toolLines = activeTools.map((a) => {
      const desc = (a.overrideAiDescription ?? a.tool.aiDescription) || a.tool.name;
      return `- **${a.tool.name}**: ${desc}`;
    });
    parts.push(
      'You have access to the following tools:\n' +
      toolLines.join('\n'),
    );

    // Build workflow guidance based on which operations are available
    const operations = new Set(
      activeTools.map((a) => (a.tool as unknown as { operation: string | null }).operation).filter(Boolean),
    );
    const hasInspect = operations.has('inspect');
    const hasEnumerate = operations.has('enumerate');
    const hasSearch = operations.has('search');
    const hasLookup = operations.has('lookup');

    const workflow: string[] = [];
    workflow.push('## How to use your tools effectively');
    workflow.push('Never fabricate information that a tool could provide — call the tool instead.');

    if (hasInspect || hasEnumerate) {
      workflow.push('');
      workflow.push('**Before searching**, gather context:');
      if (hasInspect) {
        workflow.push('1. Use the inspect tool to understand the data schema, available fields, and filter options.');
      }
      if (hasEnumerate) {
        workflow.push(
          `${hasInspect ? '2' : '1'}. Use the enumerate tool to discover valid filter values (e.g., available categories, brands, sizes) before applying filters.`,
        );
      }
    }

    if (hasSearch) {
      const step = hasInspect && hasEnumerate ? '3' : hasInspect || hasEnumerate ? '2' : '1';
      workflow.push(
        `${hasInspect || hasEnumerate ? step + '. Then search' : 'Search'} with precise filters and relevant keywords rather than sending the user\'s raw message as the query. ` +
        'Extract the intent and construct a targeted search.',
      );
    }

    if (hasLookup) {
      workflow.push('- Use the lookup tool when you have a specific document ID and need its full details.');
    }

    workflow.push('');
    workflow.push('**Important:**');
    workflow.push('- If the user\'s request is vague, ask a clarifying question before searching.');
    workflow.push('- Use filters to narrow results rather than relying solely on keyword search.');
    workflow.push('- Present results clearly with key details the user asked about.');

    parts.push(workflow.join('\n'));
  }

  // ── 4. Focus areas & avoid topics ─────────────────────────────────────────
  if (persona?.focusAreas?.length) {
    parts.push('Your areas of expertise: ' + persona.focusAreas.join(', ') + '.');
  }
  if (persona?.avoidTopics?.length) {
    parts.push(
      'Do not engage with the following topics — politely redirect the conversation: ' +
      persona.avoidTopics.join(', ') + '.',
    );
  }

  // ── 5. Response format guidance ───────────────────────────────────────────
  const fmt = persona?.responseFormats;
  if (fmt) {
    const formatHints: string[] = [];
    if (fmt.maxResponseLength) {
      formatHints.push(`Keep responses under ${fmt.maxResponseLength} tokens.`);
    }
    if (fmt.enableCitations && fmt.citationStyle !== 'none') {
      formatHints.push(
        fmt.citationStyle === 'inline'
          ? 'Include inline citations when referencing tool results.'
          : 'Add footnote citations when referencing tool results.',
      );
    }
    if (formatHints.length > 0) {
      parts.push(formatHints.join(' '));
    }
  }

  return parts.join('\n\n');
}

function buildToolDefinitions(experience: AIExperienceWithTools): ToolDefinition[] {
  return experience.tools
    .filter((assignment) => assignment.isEnabled && assignment.tool.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((assignment) => {
      // Drizzle fetches the full tool row; the TypeScript type is conservative
      const fullTool = assignment.tool as unknown as {
        slug: string;
        aiDescription: string;
        executorType: string;
        operation: string | null;
        inputSchema: Record<string, unknown> | null;
      };

      const description =
        (assignment.overrideAiDescription ?? fullTool.aiDescription) || fullTool.slug;

      // Resolve input schema: explicit → executor model default → empty
      let parameters: ToolParameterSchema;
      if (fullTool.inputSchema) {
        parameters = fullTool.inputSchema as unknown as ToolParameterSchema;
      } else {
        const schemaKey = fullTool.operation
          ? `${fullTool.executorType}:${fullTool.operation}`
          : fullTool.executorType;
        parameters =
          (EXECUTOR_INPUT_SCHEMAS[schemaKey] as ToolParameterSchema | undefined) ??
          ({ type: 'object', properties: {}, required: [] } as ToolParameterSchema);
      }

      return {
        name: fullTool.slug,
        description,
        parameters,
      };
    });
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

export async function runAIExperiencePipeline(
  experience: AIExperienceWithTools,
  userMessage: string,
  sessionId: string,
  onEvent: (event: AgenticPipelineEvent) => void,
): Promise<void> {
  const session = getOrCreateSession(sessionId, experience.id);

  // Build tool definitions (may be empty — plain chat is valid)
  const toolDefs = buildToolDefinitions(experience);

  return traceAIExperienceTurn(
    {
      experienceId: experience.id,
      sessionId,
      userMessage,
      hasTools: toolDefs.length > 0,
    },
    async (rootSpan) => {

  // Resolve AI config from experience
  const providerId = experience.providerId ?? undefined;
  const modelId = experience.modelId ?? undefined;
  const temperature = undefined; // TODO: add to personaConfig or pipeline step config
  const maxTokens = experience.personaConfig?.responseFormats?.maxResponseLength ?? undefined;
  const maxContextMessages = experience.sessionConfig?.maxContextMessages ?? 20;

  // Build message list: system + history window + user turn
  const systemPrompt = buildSystemPrompt(experience);
  const historyMessages = session.messages.slice(-maxContextMessages);
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: userMessage },
  ];

  // Record context onto the root span so the detail panel can show it
  rootSpan.addEvent('context.system_prompt', {
    prompt: systemPrompt.substring(0, 2000),
  });
  if (historyMessages.length > 0) {
    rootSpan.addEvent('context.history', {
      count: historyMessages.length,
      messages: JSON.stringify(
        historyMessages.map((m) => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content.substring(0, 500) : '[structured]',
        }))
      ),
    });
  }

  // ── AI Call #1 ─────────────────────────────────────────────────────────────
  let assistantContent = '';
  let finalToolCalls: ToolUseBlock[] = [];
  let lastUsage: TokenUsage | undefined;

  for await (const chunk of streamChat(messages, {
    providerId,
    modelId,
    temperature,
    maxTokens,
    tools: toolDefs.length > 0 ? toolDefs : undefined,
    toolChoice: toolDefs.length > 0 ? 'auto' : undefined,
    feature: 'ai-experience-chat',
    sessionId,
  })) {
    if (chunk.content) {
      assistantContent += chunk.content;
      onEvent({ type: 'content', content: chunk.content });
    }
    if (chunk.done) {
      finalToolCalls = chunk.toolCalls ?? [];
      lastUsage = chunk.usage;
    }
  }

  // ── Tool Execution ─────────────────────────────────────────────────────────
  if (finalToolCalls.length > 0) {
    // Map tool slug → assignment for dispatch
    const toolBySlug = new Map(
      experience.tools.map((assignment) => [assignment.tool.slug, assignment]),
    );

    // Execute each tool call sequentially (order matters for some tools)
    const toolResultMessages: ChatMessage[] = [];

    for (const tc of finalToolCalls) {
      const assignment = toolBySlug.get(tc.name);
      const toolCallStart = Date.now();

      const displayName = assignment?.tool.name ?? tc.name;
      onEvent({ type: 'tool_call', id: tc.id, name: tc.name, displayName, input: tc.input });

      let resultContent: string;
      let success: boolean;

      if (!assignment) {
        success = false;
        resultContent = JSON.stringify({ error: `Tool "${tc.name}" not found or not enabled` });
      } else {
        const result = await traceToolExecution(
          { experienceId: experience.id, toolName: tc.name, toolCallId: tc.id },
          async (toolSpan) => {
            toolSpan.addEvent('tool.input', {
              input: JSON.stringify(tc.input).substring(0, 2000),
            });
            const r = await executeTool(assignment.toolId, tc.input);
            toolSpan.setAttribute(ATTR.TOOL_SUCCESS, r.success);
            const outputStr = JSON.stringify(r.success ? r.data : { error: r.error });
            toolSpan.addEvent('tool.output', {
              output: outputStr.substring(0, 2000),
              success: String(r.success),
            });
            return r;
          }
        );
        success = result.success;
        resultContent = JSON.stringify(
          success ? result.data : { error: result.error },
        );
      }

      const durationMs = Date.now() - toolCallStart;
      onEvent({ type: 'tool_result', id: tc.id, name: tc.name, displayName, success, durationMs });

      toolResultMessages.push({
        role: 'tool',
        content: resultContent,
        // tool_call_id is conveyed via the content block approach below
      });
    }

    // Build messages with assistant tool-call turn + tool results
    const assistantMessageWithTools: ChatMessage = {
      role: 'assistant',
      content: assistantContent || '',
      tool_calls: finalToolCalls,
    };

    // Tool result messages — use MessageContentBlock format
    const toolResultBlocks: ChatMessage[] = finalToolCalls.map((tc, i) => ({
      role: 'tool' as const,
      content: [
        {
          type: 'tool_result' as const,
          tool_use_id: tc.id,
          content: toolResultMessages[i]?.content as string ?? '{}',
        },
      ],
    }));

    const messagesWithToolResults: ChatMessage[] = [
      ...messages,
      assistantMessageWithTools,
      ...toolResultBlocks,
    ];

    // ── AI Call #2 — synthesise final response ──────────────────────────────
    assistantContent = '';

    for await (const chunk of streamChat(messagesWithToolResults, {
      providerId,
      modelId,
      temperature,
      maxTokens,
      // No tools — force a direct text response
      feature: 'ai-experience-chat',
      sessionId,
    })) {
      if (chunk.content) {
        assistantContent += chunk.content;
        onEvent({ type: 'content', content: chunk.content });
      }
      if (chunk.done && chunk.usage) {
        // Use the second call's usage for the done event (more representative)
        lastUsage = chunk.usage;
      }
    }
  }

  // ── Persist turn ───────────────────────────────────────────────────────────
  session.messages.push(
    { role: 'user', content: userMessage },
    { role: 'assistant', content: assistantContent },
  );
  session.lastActive = new Date();

  // Record final metrics on root span
  rootSpan.setAttribute(ATTR.TOOL_CALL_COUNT, finalToolCalls.length);
  if (lastUsage) {
    rootSpan.setAttribute(ATTR.AI_TOTAL_TOKENS, lastUsage.totalTokens);
  }

  onEvent({ type: 'done', sessionId, usage: lastUsage });
    }
  );
}
