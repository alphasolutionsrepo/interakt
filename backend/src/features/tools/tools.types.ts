// src/features/tools/tools.types.ts

// Re-export validation types
export type {
  CreateToolDTO,
  UpdateToolDTO,
  ListToolsQuery,
  UpdateToolHealthDTO,
  ExecutorType,
  DataSourceOperation,
} from './tools.validation';

// Re-export database types
export type {
  Tool,
  NewTool,
  // Executor config types
  ExecutorConfig,
  DataSourceSearchConfig,
  DataSourceInspectConfig,
  DataSourceEnumerateConfig,
  DataSourceLookupConfig,
  HttpExecutorConfig,
  WebSearchExecutorConfig,
  AiCallExecutorConfig,
  // Reliability
  ToolRetryConfig,
  ToolFallbackConfig,
  ToolHealthCheckConfig,
} from '@/db/schema';

import type { ExecutorConfig } from '@/db/schema';

/**
 * Tool with usage info — returned by list endpoints
 */
export interface ToolWithUsage {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** Executor type — how this tool runs */
  executorType: string;
  /** Data source operation (only for data_source executor) */
  operation: string | null;
  /** Executor-specific configuration */
  executorConfig: ExecutorConfig | null;
  aiDescription: string;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  timeout: number;
  status: string;
  isActive: boolean;
  isSystem: boolean;
  dataSourceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  experienceCount?: number;
}

/**
 * Tool list response with pagination
 */
export interface ToolListResponse {
  tools: ToolWithUsage[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}
