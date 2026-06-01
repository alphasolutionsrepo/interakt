// app/api/analytics/chat/route.ts

/**
 * Analytics Chat API
 *
 * Provides an AI-powered interface for querying analytics data.
 * Uses function calling to execute analytics queries.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@/shared/logger/logger';
import * as aiService from '@/features/ai-service/ai-service.service';
import type { ChatMessage, ToolDefinition } from '@/features/ai-service/ai-service.types';
import { analyticsToolDefinitions, executeAnalyticsTool } from '@/features/analytics';

const logger = createLogger('analytics-chat-api');

// ============================================================================
// SCHEMA
// ============================================================================

const chatRequestSchema = z.object({
  message: z.string().min(1).max(1000),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
  // Optional provider/model override
  providerId: z.string().optional(),
  modelId: z.number().optional(),
});

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const SYSTEM_PROMPT = `You are an analytics assistant for a search platform. Your job is to help administrators understand their search and AI usage data.

You have access to analytics tools that can query the data. Use these tools to answer questions about:
- Search volume and trends
- Popular search queries
- Zero result queries (content gaps)
- Search performance and latency
- AI usage and costs
- Tool execution metrics

When answering questions:
1. ALWAYS use the appropriate tool(s) to get real data - never make up statistics
2. Present the data in a clear, readable format
3. Highlight important insights or anomalies
4. Suggest actionable improvements when relevant
5. If you can't find the data, say so clearly

Be concise but thorough. Format numbers nicely (e.g., "1,234" not "1234").`;

// ============================================================================
// TOOL DEFINITIONS FOR AI
// ============================================================================

// Map analytics tool definitions to ToolDefinition format
// Note: We cast `type: 'object'` explicitly since the source has it as string
const tools: ToolDefinition[] = analyticsToolDefinitions.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parameters: {
    ...tool.parameters,
    type: 'object' as const,
  },
}));

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationHistory = [], providerId, modelId } = chatRequestSchema.parse(body);

    // Build messages
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: message },
    ];

    // First AI call - may request tools
    // Include provider/model override if provided
    const aiOptions = {
      maxTokens: 2048,
      temperature: 0.3, // Lower temperature for more factual responses
      feature: 'analytics_chat' as const,
      tools,
      toolChoice: 'auto' as const,
      ...(providerId && { providerId }),
      ...(modelId && { modelId }),
    };

    let response = await aiService.chat(messages, aiOptions);
    const toolsUsed: string[] = [];

    // Helper to extract content from message
    const getMessageContent = (msg: ChatMessage): string => {
      if (typeof msg.content === 'string') return msg.content;
      // Handle content blocks (text blocks)
      const textBlocks = msg.content.filter(b => b.type === 'text');
      return textBlocks.map(b => (b as { type: 'text'; text: string }).text).join('');
    };

    // Handle tool calls
    while (response.toolCalls && response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        toolsUsed.push(toolCall.name);

        // Execute the tool
        const result = await executeAnalyticsTool(
          toolCall.name,
          toolCall.input as Record<string, unknown>
        );

        // Add assistant's response with tool calls
        messages.push({
          role: 'assistant',
          content: getMessageContent(response.message) || '',
          tool_calls: [toolCall],
        });

        // Add tool result
        messages.push({
          role: 'tool',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: result.success
                ? JSON.stringify(result.data, null, 2)
                : `Error: ${result.error}`,
              is_error: !result.success,
            },
          ],
        });
      }

      // Continue conversation with tool results (no tools in follow-up)
      response = await aiService.chat(messages, {
        ...aiOptions,
        tools: undefined,
        toolChoice: undefined,
      });
    }

    // Get final response content
    const responseContent = getMessageContent(response.message);

    return NextResponse.json({
      success: true,
      data: {
        response: responseContent,
        toolsUsed: [...new Set(toolsUsed)], // Deduplicate
        usage: response.usage,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: `Invalid request: ${error.message}` },
        { status: 400 }
      );
    }

    const err = error as Error;
    logger.error('Analytics chat error', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to process chat request' },
      { status: 500 }
    );
  }
}
