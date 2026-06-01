// src/features/sessions/sessions.types.ts

// Re-export validation types
export type {
  CreateSessionDTO,
  AddMessageDTO,
  UpdateSessionDTO,
  ListSessionsQuery,
} from './sessions.validation';

// Re-export database types
export type {
  AISession,
  NewAISession,
  AISessionMessage,
  NewAISessionMessage,
  SessionFacts,
  PipelineState,
  SessionUserContext,
  LastToolResults,
  SessionMessageMetadata,
} from '@/db/schema';

/**
 * Session with its sliding window of recent messages
 */
export interface SessionWithMessages {
  session: {
    id: string;
    aiExperienceId: string;
    summary: string | null;
    facts: Record<string, unknown>;
    pipelineState: Record<string, Record<string, unknown>>;
    lastToolResults: Record<string, {
      toolId: string;
      toolName: string;
      result: unknown;
      executedAt: string;
    }>;
    userContext: {
      userId?: string;
      displayName?: string;
      preferences?: Record<string, unknown>;
      permissions?: string[];
    } | null;
    status: 'active' | 'expired' | 'archived';
    messageCount: number;
    summarizedUpTo: number;
    clientMetadata: Record<string, unknown> | null;
    createdAt: Date;
    lastActiveAt: Date;
    expiresAt: Date;
  };
  messages: Array<{
    id: string;
    sessionId: string;
    role: 'user' | 'assistant' | 'system' | 'tool_result';
    content: string;
    turnIndex: number;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    embedding?: number[] | null;
  }>;
}

/**
 * Session list response with pagination
 */
export interface SessionListResponse {
  sessions: Array<{
    id: string;
    aiExperienceId: string;
    status: 'active' | 'expired' | 'archived';
    messageCount: number;
    createdAt: Date;
    lastActiveAt: Date;
    expiresAt: Date;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}
