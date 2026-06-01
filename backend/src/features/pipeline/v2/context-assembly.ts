// src/features/pipeline/v2/context-assembly.ts

/**
 * S2: Context Assembly — Deterministic Pipeline V2
 *
 * Loads and structures all context needed for a conversation turn.
 * No AI calls — pure data loading and assembly.
 *
 * Downstream modules declare which fields they need from TurnContext.
 * This module loads everything; consumers pick what they need.
 *
 * Dependencies are injected for testability:
 * - sessionLoader: loads session + message window from DB
 * - episodicMemoryLoader: retrieves relevant memories via semantic search
 *
 * See: docs/platform-evolution/DETERMINISTIC-PIPELINE-V2.md § S2
 */

import { createLogger } from '@/shared/logger/logger';
import { buildMcpToolId, buildLlmFacingName } from '@/features/mcp-connection/mcp-tool-resolver';
import type {
  ContextAssemblyInput,
  TurnContext,
  ToolSummary,
  ToolDefinitionV2,
  TurnContextMessage,
  ResultMemoryIndex,
  ModuleResult,
} from './v2.types';
import type { ResultMemoryStore } from '../pipeline.types';
import type { ToolParameterSchema } from '@/features/ai-service/ai-service.types';

const logger = createLogger('v2:context-assembly');

// ============================================================================
// DEPENDENCY INTERFACES (injected for testability)
// ============================================================================

/**
 * Loads a session and its recent message window.
 * In production: wraps sessionsService.getSessionWithWindow + createSession.
 */
export interface SessionLoader {
  getSessionWithWindow(
    sessionId: string,
    windowSize: number,
  ): Promise<SessionData | null>;

  createSession(
    experienceId: string,
    ttlMinutes: number,
  ): Promise<SessionData>;
}

/**
 * The session data shape we need from the loader.
 */
export interface SessionData {
  session: {
    id: string;
    summary: string | null;
    facts: Record<string, string> | null;
    pipelineState: Record<string, unknown> | null;
    userContext: { userId?: string; displayName?: string } | null;
    messageCount: number;
    status: string;
  };
  messages: Array<{
    role: string;
    content: string;
    createdAt: Date;
  }>;
}

/**
 * Retrieves episodic memories relevant to the current message.
 * In production: embeds the message and does cosine similarity search.
 * In tests: returns mock memories.
 */
export interface EpisodicMemoryLoader {
  retrieveRelevantMemories(
    userId: string,
    experienceId: string,
    userMessage: string,
    maxMemories: number,
  ): Promise<string[]>;
}

/**
 * All dependencies for Context Assembly, injected by the orchestrator.
 */
export interface ContextAssemblyDeps {
  sessionLoader: SessionLoader;
  episodicMemoryLoader: EpisodicMemoryLoader;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface ContextAssemblyConfig {
  /** Max messages in conversation window (default: 10) */
  maxConversationMessages: number;
  /** Max episodic memories to retrieve (default: 3) */
  maxEpisodicMemories: number;
  /** Session TTL in minutes for new sessions (default: 1440 = 24h) */
  sessionTtlMinutes: number;
}

const DEFAULT_CONFIG: ContextAssemblyConfig = {
  maxConversationMessages: 10,
  maxEpisodicMemories: 3,
  sessionTtlMinutes: 1440,
};

// ============================================================================
// MODULE ENTRY POINT
// ============================================================================

/**
 * Assemble all context for a conversation turn.
 *
 * This is the first module in the V2 deterministic pipeline.
 * It loads data from storage and structures it into a typed TurnContext
 * that downstream modules (D1, D2, D3, D4) consume.
 */
export async function assembleContext(
  input: ContextAssemblyInput,
  deps: ContextAssemblyDeps,
  config: Partial<ContextAssemblyConfig> = {},
): Promise<ModuleResult<TurnContext>> {
  const startTime = Date.now();
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Override from experience config
  if (input.experience.sessionConfig.maxContextMessages) {
    cfg.maxConversationMessages = input.experience.sessionConfig.maxContextMessages;
  }

  try {
    // 1. Load or create session
    const sessionData = await loadSession(input, deps.sessionLoader, cfg);

    // 2. Build conversation history from message window
    const conversationHistory = buildConversationHistory(sessionData.messages);

    // 3. Extract session facts
    const sessionFacts = sessionData.session.facts ?? {};

    // 4. Extract conversation summary
    const conversationSummary = sessionData.session.summary ?? null;

    // 5. Load result memory from pipeline state
    const { resultMemory, resultMemoryIndex } = loadResultMemory(
      sessionData.session.pipelineState,
    );

    // 6. Build tool summaries and full definitions. MCP tools are first-class
    //    here — same treatment as native tools, same trace observability, same
    //    error handling. Model/TPM limits are the user's choice of model, not
    //    something the pipeline papers over.
    const { availableTools, toolDefinitions, toolSlugToId, toolSlugToName, toolSlugToDisplayConfig } = buildToolContext(
      input.experience.tools,
      input.experience.mcpConnections,
    );

    // 7. Load episodic memories (async, failure-tolerant)
    //    Gated by enableUserContext — when disabled, skip the embedding + search cost.
    const episodicMemoryEnabled = input.experience.sessionConfig.enableUserContext ?? false;
    const episodicMemories = episodicMemoryEnabled
      ? await loadEpisodicMemories(
          sessionData.session.userContext?.userId,
          input.experienceId,
          input.userMessage,
          deps.episodicMemoryLoader,
          cfg.maxEpisodicMemories,
        )
      : [];

    const turnContext: TurnContext = {
      // Always available
      userMessage: input.userMessage,
      sessionId: sessionData.session.id,
      experienceId: input.experienceId,
      experienceSlug: input.experience.slug,
      sessionFacts,
      availableTools,

      // Conditionally loaded
      conversationHistory,
      conversationSummary,
      resultMemoryIndex,
      resultMemory,
      episodicMemories,
      turnLog: loadTurnLog(sessionData.session.pipelineState),

      // Raw data
      toolDefinitions,
      toolSlugToId,
      toolSlugToName,
      toolSlugToDisplayConfig,

      // Session metadata for post-turn triggers
      sessionMessageCount: sessionData.session.messageCount,
      userId: sessionData.session.userContext?.userId ?? null,

      // Experience config for downstream
      personaInstructions: input.experience.personaConfig.systemInstructions,
      businessDomain: input.experience.personaConfig.businessDomains?.join(', ') ?? null,
      providerId: input.experience.providerId,
      modelId: input.experience.modelId,

    };

    const durationMs = Date.now() - startTime;

    logger.info('Context assembled', {
      sessionId: turnContext.sessionId,
      experienceId: input.experienceId,
      historyMessages: conversationHistory.length,
      availableTools: availableTools.length,
      episodicMemories: episodicMemories.length,
      resultMemoryEntries: resultMemoryIndex.length,
      hasSummary: !!conversationSummary,
      factsCount: Object.keys(sessionFacts).length,
      durationMs,
    });

    return {
      success: true,
      data: turnContext,
      summary: `Assembled context: ${conversationHistory.length} messages, ${availableTools.length} tools, ${episodicMemories.length} memories`,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Context assembly failed', err, {
      experienceId: input.experienceId,
      sessionId: input.sessionId,
    });

    return {
      success: false,
      summary: `Context assembly failed: ${err.message}`,
      durationMs,
    };
  }
}

// ============================================================================
// INTERNAL — Session loading
// ============================================================================

async function loadSession(
  input: ContextAssemblyInput,
  sessionLoader: SessionLoader,
  config: ContextAssemblyConfig,
): Promise<SessionData> {
  if (input.sessionId) {
    const existing = await sessionLoader.getSessionWithWindow(
      input.sessionId,
      config.maxConversationMessages,
    );

    if (existing && existing.session.status === 'active') {
      return existing;
    }

    logger.info('Session not found or inactive, creating new', {
      sessionId: input.sessionId,
      experienceId: input.experienceId,
    });
  }

  // Create new session
  return sessionLoader.createSession(
    input.experienceId,
    config.sessionTtlMinutes,
  );
}

// ============================================================================
// INTERNAL — Conversation history
// ============================================================================

function buildConversationHistory(
  messages: SessionData['messages'],
): TurnContextMessage[] {
  return messages.map((m) => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
    timestamp: m.createdAt.toISOString(),
  }));
}

// ============================================================================
// INTERNAL — Result memory
// ============================================================================

function loadResultMemory(pipelineState: Record<string, unknown> | null): {
  resultMemory: ResultMemoryStore;
  resultMemoryIndex: ResultMemoryIndex;
} {
  const resultMemory: ResultMemoryStore =
    (pipelineState?.result_memory as ResultMemoryStore | undefined) ?? {
      sets: {},
      referenceIndex: [],
    };

  return {
    resultMemory,
    resultMemoryIndex: resultMemory.referenceIndex ?? [],
  };
}

// ============================================================================
// INTERNAL — Turn log
// ============================================================================

function loadTurnLog(pipelineState: Record<string, unknown> | null): import('./v2.types').TurnLogEntry[] {
  return (pipelineState?.turn_log as import('./v2.types').TurnLogEntry[] | undefined) ?? [];
}

// ============================================================================
// INTERNAL — Tool context
// ============================================================================

function buildToolContext(
  toolAssignments: ContextAssemblyInput['experience']['tools'],
  mcpAttachments?: ContextAssemblyInput['experience']['mcpConnections'],
): {
  availableTools: ToolSummary[];
  toolDefinitions: ToolDefinitionV2[];
  toolSlugToId: Record<string, string>;
  toolSlugToName: Record<string, string>;
  toolSlugToDisplayConfig: Record<string, import('@/db/schema/tools.schema').ToolDisplayConfig>;
} {
  const availableTools: ToolSummary[] = [];
  const toolDefinitions: ToolDefinitionV2[] = [];
  const toolSlugToId: Record<string, string> = {};
  const toolSlugToName: Record<string, string> = {};
  const toolSlugToDisplayConfig: Record<string, import('@/db/schema/tools.schema').ToolDisplayConfig> = {};

  for (const assignment of toolAssignments) {
    if (!assignment.isEnabled) continue;

    const tool = assignment.tool;
    if (!tool.isActive) continue;

    const description = assignment.overrideAiDescription ?? tool.aiDescription;

    // Lightweight summary for planning prompts
    availableTools.push({
      slug: tool.slug,
      name: tool.name,
      description,
      operation: tool.operation,
      executorType: tool.executorType,
    });

    // Full definition for parameter extraction
    const inputSchema: ToolParameterSchema = (tool.inputSchema as unknown as ToolParameterSchema) ?? {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query or input' },
      },
      required: ['query'],
    };

    toolDefinitions.push({
      slug: tool.slug,
      name: tool.name,
      description,
      inputSchema,
      operation: tool.operation,
      executorType: tool.executorType,
      dataSourceId: tool.dataSourceId,
      displayConfig: tool.displayConfig,
    });

    toolSlugToId[tool.slug] = tool.id;
    toolSlugToName[tool.slug] = tool.name;

    // Track display configs for preset rendering (only tools that have one)
    if (tool.displayConfig) {
      toolSlugToDisplayConfig[tool.slug] = tool.displayConfig;
    }
  }

  // Inherit display configs: tools without a displayConfig (e.g. lookup/find) inherit
  // from a sibling tool on the same data source that has one (e.g. search).
  // This allows lookup results to render with the same visual preset as search results.
  const dataSourceConfigs = new Map<string, import('@/db/schema/tools.schema').ToolDisplayConfig>();
  for (const def of toolDefinitions) {
    if (def.dataSourceId && def.displayConfig) {
      dataSourceConfigs.set(def.dataSourceId, def.displayConfig);
    }
  }
  for (const def of toolDefinitions) {
    if (def.dataSourceId && !def.displayConfig && !toolSlugToDisplayConfig[def.slug]) {
      const inherited = dataSourceConfigs.get(def.dataSourceId);
      if (inherited) {
        toolSlugToDisplayConfig[def.slug] = inherited;
      }
    }
  }

  // Materialize tools from attached MCP connections. Each connection carries a
  // cached `discoveredTools` catalog (refreshed by /api/mcp-connections/:id/sync);
  // we filter by enabledToolNames (null = all) and emit synthetic tool IDs that
  // the executor will route to the MCP transport. MCP tools are treated as
  // first-class — the planner picks them by description like any other tool.
  for (const attachment of mcpAttachments ?? []) {
    if (!attachment.isEnabled) continue;
    const conn = attachment.mcpConnection;
    if (!conn.isActive) continue;
    const catalog = conn.discoveredTools;
    if (!catalog || !Array.isArray(catalog.tools)) continue;

    const allowList = attachment.enabledToolNames;
    for (const mcpTool of catalog.tools) {
      if (allowList && !allowList.includes(mcpTool.name)) continue;

      const llmName = buildLlmFacingName(conn.slug, mcpTool.name);
      const syntheticId = buildMcpToolId(conn.id, mcpTool.name);
      const description = mcpTool.description ?? `${mcpTool.name} (MCP tool from ${conn.name})`;
      const inputSchema: ToolParameterSchema = (mcpTool.inputSchema as unknown as ToolParameterSchema) ?? {
        type: 'object',
        properties: {},
      };

      availableTools.push({
        slug: llmName,
        name: llmName,
        description,
        operation: null,
        executorType: 'mcp',
      });

      toolDefinitions.push({
        slug: llmName,
        name: llmName,
        description,
        inputSchema,
        operation: null,
        executorType: 'mcp',
        dataSourceId: null,
        displayConfig: null,
      });

      toolSlugToId[llmName] = syntheticId;
      toolSlugToName[llmName] = llmName;
    }
  }

  return { availableTools, toolDefinitions, toolSlugToId, toolSlugToName, toolSlugToDisplayConfig };
}

// ============================================================================
// INTERNAL — Episodic memory (failure-tolerant)
// ============================================================================

async function loadEpisodicMemories(
  userId: string | undefined,
  experienceId: string,
  userMessage: string,
  loader: EpisodicMemoryLoader,
  maxMemories: number,
): Promise<string[]> {
  if (!userId) {
    // Anonymous session — no episodic memory
    return [];
  }

  try {
    return await loader.retrieveRelevantMemories(
      userId,
      experienceId,
      userMessage,
      maxMemories,
    );
  } catch (error) {
    // Episodic memory is advisory — never block the turn
    logger.warn('Episodic memory retrieval failed (non-fatal)', {
      userId,
      experienceId,
      error: (error as Error).message,
    });
    return [];
  }
}

// ============================================================================
// PRODUCTION DEPENDENCY FACTORIES
// ============================================================================

/**
 * Create a SessionLoader backed by the real sessions service.
 * Import this in the pipeline orchestrator, not in tests.
 */
export function createProductionSessionLoader(): SessionLoader {
  // Lazy import to avoid circular dependencies and keep module testable
  return {
    async getSessionWithWindow(sessionId, windowSize) {
      const { getSessionWithWindow } = await import('@/features/sessions/sessions.service');
      const result = await getSessionWithWindow(sessionId, windowSize);
      if (!result) return null;

      return {
        session: {
          id: result.session.id,
          summary: (result.session as any).summary ?? null,
          facts: (result.session as any).facts as Record<string, string> | null ?? null,
          pipelineState: (result.session as any).pipelineState as Record<string, unknown> | null ?? null,
          userContext: (result.session as any).userContext as { userId?: string } | null ?? null,
          messageCount: (result.session as any).messageCount ?? 0,
          status: result.session.status,
        },
        messages: result.messages.map((m: any) => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      };
    },

    async createSession(experienceId, ttlMinutes) {
      const { createSession } = await import('@/features/sessions/sessions.service');
      const newSession = await createSession({
        aiExperienceId: experienceId,
        ttlMinutes,
      });

      return {
        session: {
          id: newSession.id,
          summary: null,
          facts: null,
          pipelineState: null,
          userContext: null,
          messageCount: 0,
          status: 'active',
        },
        messages: [],
      };
    },
  };
}

/**
 * Create an EpisodicMemoryLoader backed by the real embedding + memory services.
 * Import this in the pipeline orchestrator, not in tests.
 */
export function createProductionEpisodicMemoryLoader(): EpisodicMemoryLoader {
  return {
    async retrieveRelevantMemories(userId, experienceId, userMessage, maxMemories) {
      const { embed } = await import('@/features/embedding/embedding.service');
      const memoriesRepository = await import('@/features/user-memories/user-memories.repository');

      const queryVector = await embed(userMessage, { feature: 'episodic_memory' } as any);
      if (!queryVector) return [];

      const memories = await memoriesRepository.searchMemories(
        userId,
        experienceId,
        queryVector,
        maxMemories,
        0.45, // cosine distance threshold
      );

      // Fire-and-forget: record retrieval stats
      if (memories.length > 0) {
        memoriesRepository.recordRetrievals(memories.map((m: any) => m.id)).catch(() => {});
      }

      // Return just the content strings — no need for full memory objects downstream
      return memories.map((m: any) => m.content as string);
    },
  };
}
