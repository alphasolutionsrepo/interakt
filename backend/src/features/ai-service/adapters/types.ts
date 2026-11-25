// src/features/ai-service/adapters/types.ts

/**
 * AI Provider Adapter Interface
 * 
 * All provider adapters must implement this interface.
 * This provides a consistent API across different AI providers.
 */

import type {
    AdapterConfig,
    AdapterTextResponse,
    AdapterChatResponse,
    AdapterEmbeddingResponse,
    AdapterStreamChunk,
    TextGenerationRequest,
    ChatRequest,
    EmbeddingRequest,
    AIOperation,
} from '../ai-service.types';

import { RedirectedElsewhereError } from '@/shared/http/same-server-fetch';

// ============================================================================
// ADAPTER INTERFACE
// ============================================================================

/**
 * Base interface for all AI provider adapters
 */
export interface AIProviderAdapter {
    /**
     * Unique key for this provider (matches providerKey in database)
     */
    readonly providerKey: string;

    /**
     * Display name for logging/debugging
     */
    readonly displayName: string;

    /**
     * Check if adapter supports a specific operation
     */
    supportsOperation(operation: AIOperation): boolean;

    /**
     * Generate text (non-streaming)
     */
    generateText(
        request: TextGenerationRequest,
        config: AdapterConfig
    ): Promise<AdapterTextResponse>;

    /**
     * Chat completion (non-streaming)
     */
    chat(
        request: ChatRequest,
        config: AdapterConfig
    ): Promise<AdapterChatResponse>;

    /**
     * Stream chat completion
     * Returns an async generator yielding chunks
     */
    streamChat(
        request: ChatRequest,
        config: AdapterConfig
    ): AsyncGenerator<AdapterStreamChunk, void, unknown>;

    /**
     * Generate embeddings for multiple texts
     */
    generateEmbeddings(
        request: EmbeddingRequest,
        config: AdapterConfig
    ): Promise<AdapterEmbeddingResponse>;
}

// ============================================================================
// ADAPTER ERROR
// ============================================================================

/**
 * Error thrown by adapters with provider-specific details
 */
/**
 * How long a response asks callers to wait before trying again: its Retry-After header, in
 * seconds or as a date. Gateways and hosted APIs send it with a 429. Undefined without one.
 */
export function retryAfterMs(response: Response, now: number = Date.now()): number | undefined {
    const header = response.headers.get('retry-after')?.trim();
    if (!header) return undefined;
    if (/^\d+(\.\d+)?$/.test(header)) return Math.round(Number(header) * 1000);
    const at = Date.parse(header);
    return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

export class AdapterError extends Error {
    constructor(
        message: string,
        public readonly providerKey: string,
        public readonly statusCode?: number,
        public readonly retryable: boolean = false,
        public readonly cause?: Error,
        /** How long the provider asked callers to wait before trying again (its Retry-After) */
        public readonly retryAfterMs?: number,
    ) {
        super(message);
        this.name = 'AdapterError';
    }

    /**
     * Check if error is due to rate limiting
     */
    isRateLimited(): boolean {
        return this.statusCode === 429;
    }

    /**
     * Check if error is due to authentication
     */
    isAuthError(): boolean {
        return this.statusCode === 401 || this.statusCode === 403;
    }

    /**
     * Check if error is due to invalid request
     */
    isInvalidRequest(): boolean {
        return this.statusCode === 400;
    }

    /**
     * Check if error is server-side (potentially retryable)
     */
    isServerError(): boolean {
        return this.statusCode !== undefined && this.statusCode >= 500;
    }
}

/**
 * A provider's error answer as an AdapterError, the same for every adapter: the message the
 * provider gave (read by `messageOf` from its error body), retryable for "too many requests"
 * and server errors, with the wait the provider asked for (Retry-After).
 */
export async function errorFromResponse(
    response: Response,
    providerKey: string,
    messageOf: (body: unknown) => string | undefined,
): Promise<AdapterError> {
    let message = `HTTP ${response.status}`;
    try {
        message = messageOf(await response.json()) || message;
    } catch {
        // Not JSON: the status says it
    }
    const retryable = response.status === 429 || response.status >= 500;
    return new AdapterError(message, providerKey, response.status, retryable, undefined, retryAfterMs(response));
}

/** A request that got no answer, as an AdapterError: cancelled or timed out, or the network failed. */
export function noAnswerError(error: unknown, providerKey: string, signal?: AbortSignal): AdapterError {
    if (error instanceof AdapterError) return error;
    if (wasAborted(error, signal)) return abortedRequestError(providerKey, signal);
    // A redirect to another server answers the same on every try
    if (error instanceof RedirectedElsewhereError) return new AdapterError(error.message, providerKey, undefined, false, error);
    return new AdapterError(`Network error: ${(error as Error).message}`, providerKey, undefined, true, error as Error);
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Options for fetch requests within adapters
 */
export interface AdapterFetchOptions {
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
}

/**
 * The signal for a provider request: the adapter's timeout, plus the caller's
 * cancel signal when there is one, so a caller that goes away stops the request
 * even before the first token (a long prompt can take seconds to read).
 */
export function requestSignal(timeout: AbortSignal, caller?: AbortSignal): AbortSignal {
    return caller ? AbortSignal.any([timeout, caller]) : timeout;
}

/** A provider request its caller cancelled (it went away): the call stopped, it didn't fail */
export class CancelledRequestError extends AdapterError {
    constructor(providerKey: string) {
        super('Request cancelled by the caller', providerKey, undefined, false);
    }
}

/**
 * Whether the caller stopped the request because its own time ran out (a chat turn's
 * limit), not because it went away: it aborted with a TimeoutError, as AbortSignal.timeout does
 */
export function callerTimedOut(caller?: AbortSignal): boolean {
    return caller?.aborted === true && (caller.reason as { name?: unknown } | undefined)?.name === 'TimeoutError';
}

/**
 * Whether a provider request failed because it was aborted: by our own timer or the caller
 * (an AbortError), or by a caller that gave a reason, which fetch rejects with instead
 */
export function wasAborted(error: unknown, caller?: AbortSignal): boolean {
    return (error instanceof Error && error.name === 'AbortError') || caller?.aborted === true;
}

/**
 * A provider request stopped because its caller's own time ran out (a chat turn's limit):
 * a failed call, but not the provider's failure, since the time may have gone on other
 * steps. It isn't retried and doesn't count toward opening the provider's circuit.
 */
export class CallerTimeoutError extends AdapterError {
    constructor(providerKey: string) {
        super("Request stopped: the caller's time ran out", providerKey, undefined, false);
    }
}

/**
 * The error for a provider request that was aborted. A caller's cancel (a summary
 * the visitor left) is not a failure; a caller whose own time ran out is a failed call
 * that isn't the provider's fault. Only our own timer firing is the provider timing out.
 */
export function abortedRequestError(providerKey: string, caller?: AbortSignal): AdapterError {
    if (caller?.aborted) {
        return callerTimedOut(caller) ? new CallerTimeoutError(providerKey) : new CancelledRequestError(providerKey);
    }
    return new AdapterError('Request timed out', providerKey, undefined, true);
}

/** How long a model's stream may go quiet once it has started writing text */
export const STREAM_SILENCE_AFTER_TEXT_MS = 15_000;

/**
 * How long a model's stream may go quiet before it counts as stalled. Until the first
 * text, the provider's timeout (a slow or cold-starting model can take a while to begin,
 * and a thinking model is quiet while it thinks); once text has started, a model writes
 * well under a second apart, so STREAM_SILENCE_AFTER_TEXT_MS, or the provider's timeout
 * when that is shorter. The adapter reading the stream says when the text has started.
 */
export class StreamSilenceLimit {
    private textStarted = false;

    constructor(
        private readonly beforeTextMs: number,
        private readonly afterTextMs: number = STREAM_SILENCE_AFTER_TEXT_MS,
    ) {}

    /** The model has started writing text: from now on a shorter silence ends the stream */
    markTextStarted(): void {
        this.textStarted = true;
    }

    /** The silence allowed before the next chunk */
    get ms(): number {
        return this.textStarted ? Math.min(this.afterTextMs, this.beforeTextMs) : this.beforeTextMs;
    }
}

/** A model's stream that went quiet longer than its StreamSilenceLimit allows */
export class StreamStalledError extends AdapterError {
    constructor(providerKey: string, silenceMs: number) {
        super(`Stream timed out: no data from the model for ${Math.round(silenceMs / 1000)} s`, providerKey, undefined, true);
    }
}

/**
 * Read a provider's streaming response body as text.
 *
 * A caller that stops early (a summary the visitor cancelled) closes the body,
 * which drops the connection, so the provider stops generating. Releasing the
 * reader alone would leave the request running to its token limit. A stream that
 * goes quiet longer than its silence limit allows ends with a StreamStalledError,
 * and is closed the same way.
 */
async function* readStreamText(
    response: Response,
    providerKey: string,
    silence: StreamSilenceLimit,
): AsyncGenerator<string, void, unknown> {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new AdapterError('No response body', providerKey);
    }

    const decoder = new TextDecoder();
    let finished = false;

    try {
        while (true) {
            const { done, value } = await readWithin(reader, silence.ms, providerKey);
            if (done) {
                finished = true;
                return;
            }
            yield decoder.decode(value, { stream: true });
        }
    } finally {
        if (!finished) {
            await reader.cancel().catch(() => { /* already closed */ });
        }
        reader.releaseLock();
    }
}

/** The next chunk of a stream, or a StreamStalledError when none arrives within ms */
function readWithin(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    ms: number,
    providerKey: string,
): Promise<ReadableStreamReadResult<Uint8Array>> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new StreamStalledError(providerKey, ms)), ms);
        reader.read().then(
            (result) => { clearTimeout(timer); resolve(result); },
            (error: unknown) => { clearTimeout(timer); reject(error); },
        );
    });
}

/**
 * Split streamed text into records at a separator, keeping a partial record
 * until the rest of it arrives.
 */
async function* splitRecords(
    text: AsyncGenerator<string, void, unknown>,
    separator: string
): AsyncGenerator<string, void, unknown> {
    let buffer = '';
    for await (const chunk of text) {
        buffer += chunk;
        const records = buffer.split(separator);
        buffer = records.pop() || '';
        yield* records;
    }
    if (buffer) yield buffer;
}

/**
 * Parse SSE (Server-Sent Events) stream
 */
export async function* parseSSEStream(
    response: Response,
    providerKey: string,
    silence: StreamSilenceLimit,
): AsyncGenerator<string, void, unknown> {
    for await (const event of splitRecords(readStreamText(response, providerKey, silence), '\n\n')) {
        if (!event.trim()) continue;
        for (const line of event.split('\n')) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data !== '[DONE]') {
                    yield data;
                }
            }
        }
    }
}

/**
 * Parse Ollama NDJSON stream
 */
export async function* parseNDJSONStream(
    response: Response,
    providerKey: string,
    silence: StreamSilenceLimit,
): AsyncGenerator<string, void, unknown> {
    for await (const line of splitRecords(readStreamText(response, providerKey, silence), '\n')) {
        if (line.trim()) {
            yield line;
        }
    }
}