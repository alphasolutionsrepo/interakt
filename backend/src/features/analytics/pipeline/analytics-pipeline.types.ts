// src/features/analytics/pipeline/analytics-pipeline.types.ts

/**
 * Analytics Pipeline Types
 *
 * Type definitions for the deterministic analytics chat pipeline.
 * Follows the V2 pipeline patterns: ModuleResult envelope, dependency injection.
 */

import type { AdminChatAnalyticsData } from '@/db/analytics-schema/admin-chat-sessions.schema';
import type { ToolExecutionResult } from '../analytics-ai-tools';

// ============================================================================
// MODULE RESULT (matches V2 pattern)
// ============================================================================

export interface ModuleResult<T> {
  success: boolean;
  data?: T;
  abort?: boolean;
  summary: string;
  durationMs: number;
}

// ============================================================================
// TOOL SUMMARY (lightweight for planner)
// ============================================================================

export interface AnalyticsToolSummary {
  slug: string;
  description: string;
  category: 'precomputed' | 'live' | 'special';
  requiresParam?: string; // e.g., 'queryText' or 'traceId'
}

// ============================================================================
// CONTEXT (S2 output)
// ============================================================================

export interface AnalyticsTurnContext {
  userMessage: string;
  sessionId: string | null;
  experienceId: string | null;
  conversationHistory: AnalyticsTurnMessage[];
  conversationSummary: string | null;
  sessionFacts: Record<string, string>;
  availableTools: AnalyticsToolSummary[];
  providerId: string | null;
  modelId: number | null;
}

export interface AnalyticsTurnMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ============================================================================
// TURN PLAN (D1 output)
// ============================================================================

export interface AnalyticsTurnPlan {
  actions: AnalyticsPlannedAction[];
  reasoning: string;
  directResponse: boolean;
}

export interface AnalyticsPlannedAction {
  toolSlug: string;
  hints: Record<string, unknown>;
  intent: string;
}

// ============================================================================
// EXECUTION (D2 output)
// ============================================================================

export interface AnalyticsExecutionResult {
  executedActions: AnalyticsActionResult[];
  analyticsData: AdminChatAnalyticsData[];
}

export interface AnalyticsActionResult {
  toolSlug: string;
  intent: string;
  parameters: Record<string, unknown>;
  result: ToolExecutionResult;
  durationMs: number;
}

// ============================================================================
// SYNTHESIS (D3 output)
// ============================================================================

export interface AnalyticsSynthesisResult {
  responseText: string;
  suggestedFollowUps: string[];
}

// ============================================================================
// PIPELINE INPUT/OUTPUT
// ============================================================================

export interface AnalyticsPipelineInput {
  message: string;
  sessionId?: string;
  experienceId?: string;
  providerId?: string;
  modelId?: number;
}

export interface AnalyticsPipelineResult {
  sessionId: string;
  responseText: string;
  toolsUsed: string[];
  analyticsData: AdminChatAnalyticsData[];
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}

// ============================================================================
// SSE EVENT EMITTER
// ============================================================================

export type SSEEmitter = (data: Record<string, unknown>) => void;

// ============================================================================
// DEPENDENCY INJECTION
// ============================================================================

export interface ChatFn {
  (messages: Array<{ role: string; content: string }>, options?: Record<string, unknown>): Promise<{
    message: { content: string | unknown[] };
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  }>;
}

export interface StreamChatFn {
  (messages: Array<{ role: string; content: string }>, options?: Record<string, unknown>): AsyncGenerator<{
    content?: string;
    done?: boolean;
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  }>;
}
