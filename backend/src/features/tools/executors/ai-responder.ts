// src/features/tools/executors/ai-responder.ts
//
// Executes an ai_responder tool config by making a single non-streaming
// chat call to the AI service using the tool's custom instructions as
// the system prompt.
//
// Provider, model, temperature, and maxTokens in the config optionally
// override the system defaults — allowing each tool instance to have its
// own personality or cost profile (e.g. a cheap fast model for jokes,
// a powerful model for analysis).

import { chat } from '@/features/ai-service/ai-service.service';
import type { ToolExecutionResult } from '../tools.executor';

// ============================================================================
// CONFIG TYPE
// ============================================================================

interface AiResponderConfig {
  instructions: string;
  providerId?: string | null;
  modelId?: number | null;
  temperature?: number;
  maxTokens?: number;
}

// ============================================================================
// MAIN EXECUTOR
// ============================================================================

export async function executeAiResponder(
  config: Record<string, unknown>,
  input: Record<string, unknown>,
): Promise<Omit<ToolExecutionResult, 'durationMs'>> {
  const cfg = config as unknown as AiResponderConfig;

  const userInput = typeof input.input === 'string' ? input.input.trim() : '';
  if (!userInput) {
    return { success: false, error: 'Missing required input field: "input"' };
  }

  if (!cfg.instructions?.trim()) {
    return { success: false, error: 'AI responder tool is missing instructions in its configuration' };
  }

  try {
    const result = await chat(
      [
        { role: 'system', content: cfg.instructions.trim() },
        { role: 'user', content: userInput },
      ],
      {
        ...(cfg.providerId ? { providerId: cfg.providerId } : {}),
        ...(cfg.modelId != null ? { modelId: cfg.modelId } : {}),
        ...(cfg.temperature != null ? { temperature: cfg.temperature } : {}),
        ...(cfg.maxTokens ? { maxTokens: cfg.maxTokens } : {}),
        feature: 'ai_responder_tool',
      },
    );

    const content = result.message.content;
    const responseText = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
            .map((b) => b.text)
            .join('')
        : '';

    if (!responseText) {
      return { success: false, error: 'AI responder returned an empty response' };
    }

    return {
      success: true,
      data: { response: responseText },
    };
  } catch (err) {
    return {
      success: false,
      error: (err instanceof Error ? err.message : String(err)),
    };
  }
}
