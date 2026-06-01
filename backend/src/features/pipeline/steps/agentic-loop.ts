// src/features/pipeline/steps/agentic-loop.ts

/**
 * Agentic Loop Step
 *
 * AI-driven tool calling loop. The LLM decides which tools to call,
 * processes results, and generates a response. Supports multiple
 * iterations (AI calls tool → gets result → decides next action).
 *
 * Flow:
 * 1. Build tool definitions from experience's assigned tools
 * 2. Build messages: system prompt + conversation history + user message
 * 3. Stream AI response — if AI calls tools, execute them
 * 4. Feed tool results back, let AI continue (up to maxIterations)
 * 5. Final AI response is the user-facing output
 */

import type { Span } from '@opentelemetry/api';
import { streamChat } from '@/features/ai-service/ai-service.service';
import { executeTool } from '@/features/tools/tools.executor';
import { shouldLogContent } from '@/features/telemetry';
import type {
  ChatMessage,
  ToolDefinition,
  ToolUseBlock,
  ToolResultBlock,
} from '@/features/ai-service/ai-service.types';
import type { StepHandler, PipelineContext, StepResult } from '../pipeline.types';
import { applyToolResultToMemory } from './result-memory';
import { classifyLlmFailure } from '../fallback-messages';

// ============================================================================
// TYPES
// ============================================================================

interface AgenticLoopConfig {
  /** Max tool-calling iterations before forcing a final response */
  maxIterations?: number;
  /** Temperature for the agentic AI */
  temperature?: number;
  /** Max tokens per AI call */
  maxTokens?: number;
  /** AI provider override */
  providerId?: string;
  modelId?: number;
  /** System prompt / instructions */
  systemInstructions?: string;
  /** Persona config */
  personaName?: string;
  tone?: string;
  /** Tool definitions (pre-built from experience tools) */
  toolDefinitions?: ToolDefinition[];
  /** Mapping of tool name → tool ID for execution */
  toolNameToId?: Record<string, string>;
}

// ============================================================================
// STEP HANDLER
// ============================================================================

export const agenticLoopHandler: StepHandler = {
  type: 'agentic_loop',

  async execute(
    config: Record<string, unknown>,
    ctx: PipelineContext,
    span: Span,
  ): Promise<StepResult> {
    const cfg = config as unknown as AgenticLoopConfig;
    const maxIterations = cfg.maxIterations ?? 5;
    const toolDefs = cfg.toolDefinitions ?? (ctx.shared.toolDefinitions as ToolDefinition[]) ?? [];
    const toolNameToId = cfg.toolNameToId ?? (ctx.shared.toolNameToId as Record<string, string>) ?? {};

    const systemPrompt = buildAgenticSystemPrompt(cfg, toolDefs);

    // Build initial messages
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...ctx.conversationHistory.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: ctx.userMessage },
    ];

    // Record the system prompt and tool list in the span for debugging (full telemetry only)
    if (shouldLogContent(ctx.experienceId)) {
      span.addEvent('agentic.system_prompt', {
        system_prompt: systemPrompt,
        tool_count: toolDefs.length,
        tool_names: toolDefs.map(t => t.name).join(', '),
        tool_definitions: JSON.stringify(toolDefs.map(t => ({ name: t.name, description: t.description }))),
      });
    }

    let iterations = 0;
    let totalToolCalls = 0;
    let finalText = '';

    while (iterations < maxIterations) {
      iterations++;
      span.setAttribute('agentic.iteration', iterations);

      // Stream AI response.
      // When tools are available the model will either call a tool (no text) or
      // respond directly (text). We stream to the client so the response appears
      // word-by-word instead of all at once after the full buffer is collected.
      const { text, toolCalls, usage } = await streamAIResponse(
        messages,
        toolDefs.length > 0 ? toolDefs : undefined,
        cfg,
        ctx,
        true, // always stream chunks to client in real-time
      );

      // Accumulate token usage
      if (usage) {
        ctx.tokenUsage.promptTokens += usage.inputTokens;
        ctx.tokenUsage.completionTokens += usage.outputTokens;
        ctx.tokenUsage.totalTokens += usage.totalTokens;
      }

      // If no tool calls, this is the final response (already streamed above)
      if (!toolCalls?.length) {
        finalText = text;
        break;
      }

      // Execute tool calls in parallel. Each call is independent at the tool
      // layer (the executor owns retry/timeout/secrets per tool); fanning out
      // turns N tools-per-iteration into N× latency wins. We still apply
      // result memory serially below, in tool-call order, because
      // applyToolResultToMemory mutates ctx.resultMemory in an order-sensitive
      // way (last-search wins on the reference index).
      totalToolCalls += toolCalls.length;

      // Emit tool_call events synchronously up-front so the client sees the
      // fan-out, not just the (later, racing) results.
      for (const toolCall of toolCalls) {
        const toolId = toolNameToId[toolCall.name];
        ctx.emitEvent({
          type: 'tool_call',
          id: toolId ?? toolCall.name,
          name: toolCall.name,
          arguments: toolCall.input,
        });
      }

      const settled = await Promise.all(toolCalls.map(async (toolCall) => {
        const toolId = toolNameToId[toolCall.name];
        if (!toolId) {
          return { toolCall, toolId: null as string | null, result: null };
        }
        const result = await executeTool(toolId, toolCall.input).catch((err: unknown) => ({
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: 0,
        }));
        return { toolCall, toolId, result };
      }));

      const toolResults: ToolResultBlock[] = [];

      for (const { toolCall, toolId, result } of settled) {
        if (!toolId || !result) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: JSON.stringify({ error: `Unknown tool: ${toolCall.name}` }),
            is_error: true,
          });
          ctx.emitEvent({
            type: 'tool_result',
            id: toolCall.name,
            success: false,
            durationMs: 0,
          });
          continue;
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: JSON.stringify(result.success ? (result as { data?: unknown }).data : { error: result.error }),
          is_error: !result.success,
        });

        const rawOutput = ((result as { data?: unknown }).data ?? {}) as Record<string, unknown>;

        ctx.emitEvent({
          type: 'tool_result',
          id: toolId,
          success: result.success,
          resultCount: (rawOutput?.results as unknown[] | undefined)?.length,
          durationMs: result.durationMs,
        });

        // Update result memory in tool-call order — order-sensitive.
        if (result.success) {
          applyToolResultToMemory(toolCall.name, rawOutput, ctx);
        }
      }

      // Add assistant message with tool calls + tool results to conversation
      messages.push({
        role: 'assistant',
        content: text || '',
        tool_calls: toolCalls,
      });

      // Add tool results as individual messages
      for (const tr of toolResults) {
        messages.push({
          role: 'tool',
          content: [tr],
        });
      }
    }

    // If we exhausted iterations without a final response, force one (no tools = guaranteed text)
    if (!finalText && iterations >= maxIterations) {
      const { text, usage } = await streamAIResponse(messages, undefined, cfg, ctx, true);
      if (usage) {
        ctx.tokenUsage.promptTokens += usage.inputTokens;
        ctx.tokenUsage.completionTokens += usage.outputTokens;
        ctx.tokenUsage.totalTokens += usage.totalTokens;
      }
      finalText = text;
    }

    ctx.responseText = finalText;
    ctx.responseMetadata = { preset: 'markdown_rich' };

    span.setAttribute('agentic.iterations', iterations);
    span.setAttribute('agentic.tool_calls', totalToolCalls);
    span.setAttribute('agentic.response_length', finalText.length);

    return {
      success: true,
      data: { iterations, totalToolCalls, responseLength: finalText.length },
      summary: `Agentic loop: ${iterations} iterations, ${totalToolCalls} tool calls`,
    };
  },

  async fallback(
    _config: Record<string, unknown>,
    ctx: PipelineContext,
    error: Error,
  ): Promise<StepResult> {
    const fallbackText = describeAgenticFailure(error);
    ctx.responseText = fallbackText;
    ctx.responseMetadata = { preset: 'plain_text' };
    ctx.emitEvent({ type: 'content', text: fallbackText });

    return {
      success: false,
      data: { error: error.message },
      summary: `Agentic loop failed, used fallback: ${error.message}`,
    };
  },
};

function describeAgenticFailure(error: Error): string {
  return classifyLlmFailure(error)
    ?? 'I apologize, but I encountered an issue processing your request. Could you please try again?';
}

// ============================================================================
// AI STREAMING
// ============================================================================

interface StreamResult {
  text: string;
  toolCalls?: ToolUseBlock[];
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}

async function streamAIResponse(
  messages: ChatMessage[],
  tools: ToolDefinition[] | undefined,
  cfg: AgenticLoopConfig,
  ctx: PipelineContext,
  /** When true, emit content chunks to the client in real-time as they stream */
  streamToClient = false,
): Promise<StreamResult> {
  let text = '';
  let toolCalls: ToolUseBlock[] | undefined;
  let usage: StreamResult['usage'] | undefined;

  for await (const chunk of streamChat(messages, {
    temperature: cfg.temperature ?? 0.7,
    maxTokens: cfg.maxTokens ?? 4096,
    providerId: cfg.providerId,
    modelId: cfg.modelId,
    tools,
    toolChoice: tools?.length ? 'auto' : undefined,
    experienceId: ctx.experienceId,
  })) {
    if (chunk.content) {
      text += chunk.content;
      if (streamToClient) {
        ctx.emitEvent({ type: 'content', text: chunk.content });
      }
    }
    if (chunk.toolCalls?.length) {
      toolCalls = chunk.toolCalls;
    }
    if (chunk.done && chunk.usage) {
      usage = chunk.usage;
    }
  }

  return { text, toolCalls, usage };
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

function buildAgenticSystemPrompt(cfg: AgenticLoopConfig, toolDefs: ToolDefinition[]): string {
  const parts: string[] = [];

  // ── 1. Core identity ──────────────────────────────────────────────────────
  const personaName = cfg.personaName?.trim();
  if (cfg.systemInstructions?.trim()) {
    if (personaName) {
      parts.push(`You are "${personaName}". ${cfg.systemInstructions.trim()}`);
    } else {
      parts.push(cfg.systemInstructions.trim());
    }
  } else if (personaName) {
    parts.push(`You are ${personaName}, a helpful AI assistant.`);
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
  if (cfg.tone && toneGuide[cfg.tone]) {
    parts.push(toneGuide[cfg.tone]);
  }

  // ── 3. Tool awareness & workflow guidance ─────────────────────────────────
  if (toolDefs.length > 0) {
    const toolLines = toolDefs.map(t =>
      `- **${t.name}**: ${t.description}`,
    );
    parts.push('You have access to the following tools:\n' + toolLines.join('\n'));

    // Identify tools by their typed operation/executorType fields — always set at creation time.
    // data_source tools always have an `operation` (search|inspect|enumerate|lookup|query).
    // Standalone tools (http, mcp, ai_call) have only `executorType`, no operation.
    const inspectTool = toolDefs.find(t => t.operation === 'inspect');
    const enumerateTool = toolDefs.find(t => t.operation === 'enumerate');
    const searchTool = toolDefs.find(t => t.operation === 'search' || t.operation === 'query');
    const lookupTool = toolDefs.find(t => t.operation === 'lookup');

    const workflow: string[] = [];
    workflow.push('## How to use your tools effectively');
    workflow.push('Never fabricate information that a tool could provide — call the tool instead.');

    if (inspectTool || enumerateTool) {
      workflow.push('');
      workflow.push('**Recommended workflow for new questions:**');
      let step = 1;
      if (inspectTool) {
        workflow.push(`${step++}. Call \`${inspectTool.name}\` first to understand available fields, filter options, and data structure. Do this on the first turn or when the user asks about filtering/sorting options.`);
      }
      if (enumerateTool) {
        workflow.push(`${step++}. Call \`${enumerateTool.name}\` to discover valid values for a specific field before filtering on it (e.g., to find valid category names, brands, sizes).`);
      }
      if (searchTool) {
        workflow.push(`${step++}. Call \`${searchTool.name}\` with precise filters and keywords extracted from the user's intent — not just the raw message.`);
      }
    } else if (searchTool) {
      workflow.push(`\nUse \`${searchTool.name}\` with precise filters and keywords extracted from the user's intent.`);
    }

    if (lookupTool) {
      workflow.push(`\nUse \`${lookupTool.name}\` when you have a specific document ID and need its full details.`);
    }

    workflow.push('');
    workflow.push('**Important rules:**');
    workflow.push("- Do NOT forward the user's raw message as the search query. Extract the intent and key terms.");
    workflow.push('- Use filters to narrow results (e.g., category, price range, gender) whenever the user implies them.');
    workflow.push("- If the user's request is ambiguous, ask one focused clarifying question.");
    workflow.push('- Present results clearly with the key details the user asked about.');
    workflow.push('- If a tool call fails, explain what happened and try an alternative approach.');

    parts.push(workflow.join('\n'));
  }

  return parts.join('\n\n');
}
