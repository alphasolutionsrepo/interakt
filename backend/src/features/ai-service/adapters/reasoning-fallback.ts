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

/** Models already reported as refusing a vector size, by server and model */
const warnedNoDimensions = new Set<string>();

/**
 * Send an embedding request, and when the server refuses the vector size it carries (400 or
 * 422 naming dimensions: OpenAI's ada-002, Ollama for a size above the model's own), send it
 * once more without one: the call works, with the model's own size (the AI service warns when
 * that differs from the index), and a warning, once per model on each server, says so.
 */
export async function withoutUnsupportedDimensions<B extends { model: string; dimensions?: number }, T>(
    server: string,
    body: B,
    send: (body: B) => Promise<T>,
): Promise<T> {
    try {
        return await send(body);
    } catch (error) {
        const refused = error instanceof AdapterError
            && (error.statusCode === 400 || error.statusCode === 422)
            && /dimensions/i.test(error.message);
        if (!refused || body.dimensions === undefined) throw error;
        const key = `${server}|${body.model}`;
        if (!warnedNoDimensions.has(key)) {
            warnedNoDimensions.add(key);
            logger.warn('Model refused the requested embedding size; sent without it', { model: body.model, dimensions: body.dimensions });
        }
        const { dimensions: _dropped, ...without } = body;
        return send(without as B);
    }
}
