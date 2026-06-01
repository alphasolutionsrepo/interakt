// src/features/pipeline/steps/episodic-memory.ts

/**
 * Episodic Memory Step (Sprint 5 / Phase D)
 *
 * Runs at turn start (before tool_selection or agentic_loop) and injects
 * relevant cross-session memories about the user into the pipeline context.
 *
 * Flow:
 * 1. Read userId from session.userContext (set externally by the auth layer)
 * 2. If no userId → skip silently (anonymous sessions have no episodic memory)
 * 3. Embed the current user message
 * 4. Retrieve top-K memories from user_memories via cosine similarity
 * 5. Write memories to ctx.shared.episodicMemories for downstream steps
 * 6. Fire-and-forget: increment retrievalCount for retrieved memories
 *
 * Downstream consumers:
 * - response_synthesis: appends memories to the system prompt
 * - agentic_loop: same — memories appear in system context
 *
 * Failure handling: onFailure: 'skip' — episodic memory is advisory.
 * A failure here must never block the turn.
 */

import type { Span } from '@opentelemetry/api';
import { embed } from '@/features/embedding/embedding.service';
import * as memoriesRepository from '@/features/user-memories/user-memories.repository';
import type { StepHandler, PipelineContext, StepResult } from '../pipeline.types';
import type { SessionUserContext } from '@/db/schema/ai-sessions.schema';
import type { UserMemory } from '@/db/schema';

// ============================================================================
// TYPES
// ============================================================================

export interface EpisodicMemoryResult {
  /** Whether the step ran (false when no userId in session) */
  active: boolean;
  /** Number of memories retrieved */
  retrieved: number;
}

interface EpisodicMemoryConfig {
  /** Max memories to inject per turn (default 5) */
  maxMemories?: number;
  /** Cosine distance threshold for retrieval (default 0.45) */
  maxDistance?: number;
}

// ============================================================================
// STEP HANDLER
// ============================================================================

export const episodicMemoryHandler: StepHandler = {
  type: 'episodic_memory',

  async execute(
    config: Record<string, unknown>,
    ctx: PipelineContext,
    span: Span,
  ): Promise<StepResult> {
    const cfg = config as unknown as EpisodicMemoryConfig;
    const maxMemories = cfg.maxMemories ?? 5;
    const maxDistance = cfg.maxDistance ?? 0.45;

    // 1. Extract userId from shared context (populated from session.userContext)
    const userContext = ctx.shared.userContext as SessionUserContext | undefined;
    const userId = userContext?.userId;

    span.setAttribute('episodic_memory.has_user_id', !!userId);

    if (!userId) {
      // Anonymous session — skip gracefully
      ctx.shared.episodicMemories = [];
      const result: EpisodicMemoryResult = { active: false, retrieved: 0 };
      return {
        success: true,
        data: result as unknown as Record<string, unknown>,
        summary: 'Skipped — no userId in session context',
      };
    }

    // 2. Embed the current user message
    const queryVector = await embed(ctx.userMessage, { feature: 'episodic_memory' } as any);

    if (!queryVector) {
      // Embedding failed — skip gracefully, don't abort the turn
      ctx.shared.episodicMemories = [];
      const result: EpisodicMemoryResult = { active: true, retrieved: 0 };
      return {
        success: true,
        data: result as unknown as Record<string, unknown>,
        summary: 'Skipped — embedding failed',
      };
    }

    // 3. Retrieve relevant memories
    const memories = await memoriesRepository.searchMemories(
      userId,
      ctx.experienceId,
      queryVector,
      maxMemories,
      maxDistance,
    );

    span.setAttribute('episodic_memory.retrieved', memories.length);

    // 4. Write to shared context for downstream steps
    ctx.shared.episodicMemories = memories;

    // 5. Fire-and-forget: record retrieval stats
    if (memories.length > 0) {
      memoriesRepository.recordRetrievals(memories.map((m: UserMemory) => m.id)).catch(() => {
        // Non-fatal — ignore
      });
    }

    const result: EpisodicMemoryResult = { active: true, retrieved: memories.length };
    return {
      success: true,
      data: result as unknown as Record<string, unknown>,
      summary: `Retrieved ${memories.length} memories for user ${userId}`,
    };
  },
};
