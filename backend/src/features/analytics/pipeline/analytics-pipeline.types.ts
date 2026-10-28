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
  /**
   * Who the tool is for, when not everyone: 'chat-experiences' needs conversation
   * data (not search experiences); 'all-experiences' compares experiences, so only
   * when the conversation isn't scoped to one
   */
  availability?: 'chat-experiences' | 'all-experiences';
}

// ============================================================================
// CONTEXT (S2 output)
// ============================================================================

export interface AnalyticsTurnContext {
  userMessage: string;
  sessionId: string | null;
  experienceId: string | null;
  /** Display name of the selected experience (null = all experiences) */
  experienceName: string | null;
  /** Time range selected on the analytics page; the default for every tool call */
  timeRange: string | null;
  /**
   * The exact period selected on the analytics page; when set, the default for
   * every tool call (timeRange is then its nearest fixed range, for tools that
   * only have those)
   */
  period: { from: Date; to: Date } | null;
  /** The viewer's IANA time zone: what "today" and "Oct 13" mean */
  timeZone: string;
  /** The analytics section the question was asked from, e.g. "Search" */
  pageSection: string | null;
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
  /** The period the result covers, in words, for its card */
  periodLabel?: string;
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
  experienceName?: string;
  timeRange?: string;
  /** The page's exact period (ISO instants) */
  period?: { from: string; to: string };
  timeZone?: string;
  pageSection?: string;
  providerId?: string;
  modelId?: number;
  /** Aborted when the asker goes away (Stop, or closing the page): the turn stops and isn't saved */
  signal?: AbortSignal;
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
