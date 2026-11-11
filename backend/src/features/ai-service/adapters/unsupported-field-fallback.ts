// src/features/ai-service/adapters/unsupported-field-fallback.ts

import { AdapterError } from './types';

import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('ai-adapters');

/**
 * Send a request, and when the server refuses a field the request carries, send it once more
 * without that field: the call works, and a warning, once per model on each server (the same
 * name on another server is another model, set up on its own), says what was left out.
 *
 * refused holds the first refusal for each server and model. With remember, a model that
 * refused is not sent the field again (no second request for every call). Each use of this
 * keeps its own map. verify, when given, sees the answer that came back without the field
 * and the refusal, and throws to reject it (for example a vector of the wrong size).
 */
export interface UnsupportedFieldFallback<B, T> {
    server: string;
    body: B & { model: string };
    field: string;
    isRefusal: (error: AdapterError) => boolean;
    refused: Map<string, AdapterError>;
    remember?: boolean;
    warning: string;
    verify?: (answer: T, refusal: AdapterError) => void;
}

export async function withoutUnsupportedField<B, T>(
    { server, body, field, isRefusal, refused, remember = false, warning, verify }: UnsupportedFieldFallback<B, T>,
    send: (body: B & { model: string }) => Promise<T>,
): Promise<T> {
    const record = body as Record<string, unknown>;

    if (record[field] === undefined) return send(body);

    const key = `${server}|${body.model}`;
    const without = () => {
        const { [field]: _dropped, ...rest } = record;
        return rest as B & { model: string };
    };

    const earlier = refused.get(key);
    if (remember && earlier) {
        const answer = await send(without());
        verify?.(answer, earlier);
        return answer;
    }

    try {
        return await send(body);
    } catch (error) {
        if (!(error instanceof AdapterError) || !isRefusal(error)) throw error;
        if (!refused.has(key)) {
            refused.set(key, error);
            logger.warn(warning, { model: body.model, [field]: record[field], reason: error.message });
        }
        const answer = await send(without());
        verify?.(answer, refused.get(key)!);
        return answer;
    }
}

/** Models that refused a reasoning level, by server and model */
const refusedReasoning = new Map<string, AdapterError>();

/**
 * A model with a reasoning level it can't use (Ollama answers 400 "<model> does not support
 * thinking", natively and through its OpenAI-compatible API) is asked again without one.
 * field is where the request carries the level.
 */
export function withoutUnsupportedReasoning<B extends { model: string }, T>(
    server: string,
    body: B,
    field: 'think' | 'reasoning_effort',
    send: (body: B) => Promise<T>,
): Promise<T> {
    return withoutUnsupportedField<B, T>({
        server,
        body,
        field,
        isRefusal: (error) => error.statusCode === 400 && /does not support thinking/i.test(error.message),
        refused: refusedReasoning,
        warning: 'Model does not support thinking; sent without its reasoning level',
    }, send);
}

/** Models that refused a vector size, by server and model */
const refusedDimensions = new Map<string, AdapterError>();

/**
 * An embedding request with a vector size the server refuses (any 400 or 422, whatever the
 * body says: OpenAI's ada-002, Ollama for a size above the model's own, other servers in
 * their own words) is sent again without one, and the model is not sent a size again. When the
 * vectors that come back are not the size asked for, the refusal is thrown instead, with the
 * provider's own message: a wrong-size vector fails later, in the index.
 */
export function withoutUnsupportedDimensions<B extends { model: string; dimensions?: number }, T>(
    server: string,
    body: B,
    vectorSize: (answer: T) => number,
    send: (body: B) => Promise<T>,
): Promise<T> {
    return withoutUnsupportedField<B, T>({
        server,
        body,
        field: 'dimensions',
        isRefusal: (error) => error.statusCode === 400 || error.statusCode === 422,
        refused: refusedDimensions,
        remember: true,
        warning: 'Model refused the requested embedding size; sent without it',
        verify: (answer, refusal) => {
            if (vectorSize(answer) !== body.dimensions) throw refusal;
        },
    }, send);
}
