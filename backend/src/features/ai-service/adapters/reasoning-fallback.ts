// src/features/ai-service/adapters/reasoning-fallback.ts

import { AdapterError } from './types';

import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('ai-adapters');

/** Models already reported as not thinking, by server and model, so the warning is logged once for each */
const warnedNoThinking = new Set<string>();

/**
 * Send a request, and when the model has a reasoning level it can't use (Ollama answers
 * 400 "<model> does not support thinking", natively and through its OpenAI-compatible
 * API), send it once more without one: the call works, and a warning, once per model on
 * each server (the same name on another server is another model, set up on its own), says
 * to clear the setting. field is where the request carries the level.
 */
export async function withoutUnsupportedReasoning<B extends { model: string }, T>(
    server: string,
    body: B,
    field: 'think' | 'reasoning_effort',
    send: (body: B) => Promise<T>,
): Promise<T> {
    try {
        return await send(body);
    } catch (error) {
        const setting = (body as Record<string, unknown>)[field];
        const refused = error instanceof AdapterError && error.statusCode === 400 && /does not support thinking/i.test(error.message);
        if (!refused || setting === undefined) throw error;
        const key = `${server}|${body.model}`;
        if (!warnedNoThinking.has(key)) {
            warnedNoThinking.add(key);
            logger.warn('Model does not support thinking; sent without its reasoning level', { model: body.model, [field]: setting });
        }
        const { [field]: _dropped, ...without } = body as Record<string, unknown>;
        return send(without as B);
    }
}
