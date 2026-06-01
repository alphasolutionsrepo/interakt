import { createLogger } from '@/shared/logger/logger';
import type { PipelineStepType, StepHandler } from './pipeline.types';

// ============================================================================
// STEP REGISTRY — register and lookup pipeline step handlers by type
// ============================================================================

const logger = createLogger('pipeline:step-registry');

// Use globalThis to survive Next.js dev server module re-instantiation.
// Without this, instrumentation.ts registers handlers into one Map instance,
// but API route handlers read from a different instance of the same module.
const GLOBAL_KEY = '__pipeline_step_handlers__' as const;

function getHandlers(): Map<PipelineStepType, StepHandler> {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = new Map<PipelineStepType, StepHandler>();
  }
  return (globalThis as any)[GLOBAL_KEY];
}

/**
 * Register a step handler for a given pipeline step type.
 * Silently skips if a handler is already registered for that type
 * (can happen during HMR in development).
 */
export function registerStepHandler(handler: StepHandler): void {
  const handlers = getHandlers();
  if (handlers.has(handler.type)) {
    // In dev, modules can re-execute — skip duplicate registration
    logger.debug('Step handler already registered, skipping', { stepType: handler.type });
    return;
  }
  handlers.set(handler.type, handler);
  logger.debug('Step handler registered', { stepType: handler.type });
}

/**
 * Get the handler for a given step type.
 * Returns undefined if no handler is registered.
 */
export function getStepHandler(type: PipelineStepType): StepHandler | undefined {
  return getHandlers().get(type);
}

/**
 * Get the handler for a given step type, or throw if not found.
 */
export function requireStepHandler(type: PipelineStepType): StepHandler {
  const handler = getHandlers().get(type);
  if (!handler) {
    throw new Error(
      `No step handler registered for type "${type}". ` +
      `Ensure the handler is registered before pipeline execution.`,
    );
  }
  return handler;
}

/**
 * List all registered step types. Useful for diagnostics.
 */
export function getRegisteredStepTypes(): PipelineStepType[] {
  return Array.from(getHandlers().keys());
}

/**
 * Remove all registered handlers. Only intended for testing.
 */
export function clearStepHandlers(): void {
  getHandlers().clear();
}
