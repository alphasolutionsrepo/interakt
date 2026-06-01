// src/features/ai-experience/ai-experience.types.ts

// Re-export validation types
export type {
  CreateAIExperienceDTO,
  UpdateAIExperienceDTO,
  AssignToolDTO,
  UpdateToolAssignmentDTO,
  ListAIExperiencesQuery,
} from './ai-experience.validation';

// Re-export database types
export type {
  AIExperience,
  NewAIExperience,
  AIExperienceTool,
  NewAIExperienceTool,
  PersonaConfig,
  GuardrailConfig,
  GuardrailStepConfig,
  GuardrailRule,
  GuardrailRuleType,
  SessionConfig,
  AccessConfig,
  ObservabilityConfig,
  AgenticConfig,
  ResponsePreset,
} from '@/db/schema';

import type { PipelineConfig } from '@/features/pipeline/pipeline.types';
import type {
  PersonaConfig,
  GuardrailConfig,
  SessionConfig,
  AccessConfig,
  ObservabilityConfig,
  AgenticConfig,
} from '@/db/schema/ai-experience.schema';

/**
 * AI Experience with its assigned tools (returned by queries with relations)
 */
export interface AIExperienceWithTools {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  pipelineMode: string;
  pipelineConfig: PipelineConfig | null;
  agenticConfig: AgenticConfig | null;
  personaConfig: PersonaConfig;
  guardrailConfig: GuardrailConfig | null;
  sessionConfig: SessionConfig;
  accessToken: string;
  accessConfig: AccessConfig;
  observabilityConfig: ObservabilityConfig;
  providerId: string | null;
  modelId: number | null;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  tools: AIExperienceToolAssignment[];
  mcpConnections: AIExperienceMcpConnectionAssignment[];
}

/**
 * MCP connection attachment within an experience.
 * The connection carries its own cached `discoveredTools` catalog — the pipeline
 * materializes ToolDefinitions from that catalog at runtime (no DB row per tool).
 */
export interface AIExperienceMcpConnectionAssignment {
  id: string;
  mcpConnectionId: string;
  enabledToolNames: string[] | null;
  isEnabled: boolean;
  sortOrder: number;
  mcpConnection: {
    id: string;
    name: string;
    slug: string;
    serverUrl: string;
    transport: string;
    isActive: boolean;
    status: string;
    discoveredTools: {
      tools: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
      }>;
      serverInfo?: { name?: string; version?: string };
      protocolVersion?: string;
    } | null;
  };
}

/**
 * Tool assignment details within an experience
 */
export interface AIExperienceToolAssignment {
  id: string;
  toolId: string;
  overrideAiDescription: string | null;
  overrideConfig: Record<string, unknown> | null;
  isEnabled: boolean;
  sortOrder: number;
  tool: {
    id: string;
    name: string;
    slug: string;
    executorType: string;
    operation: string | null;
    aiDescription: string;
    inputSchema: Record<string, unknown> | null;
    isActive: boolean;
    dataSourceId: string | null;
  };
}

/**
 * AI Experience list response with pagination
 */
export interface AIExperienceListResponse {
  experiences: AIExperienceWithTools[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}
