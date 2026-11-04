// src/shared/errors/error-detail.ts

/**
 * Turns any thrown error into something an admin can read: the message, what the
 * provider said (status, code, response body) and the chain of causes. Provider SDK
 * errors carry the useful part in different places (Azure RestError:
 * statusCode/code/details, Elasticsearch: meta.body.error, OpenAI: status/error), and
 * the request headers next to it hold API keys, so everything goes through
 * redactSecrets before it is shown. upstream.ts builds the explanation and hint from it.
 *
 * No Node-only imports, so it stays usable from any code, the logger included.
 */

export interface ErrorDetail {
    message: string;
    name?: string;
    /** Provider or service error code, e.g. "InvalidRequestParameter", "RATE_LIMITED" */
    code?: string;
    statusCode?: number;
    provider?: string;
    retryable?: boolean;
    /** What the provider sent back, redacted and truncated */
    details?: unknown;
    /** Messages of the errors this one wraps, outermost first */
    causes?: string[];
}

const MAX_STRING = 4000;
const MAX_DEPTH = 6;
const MAX_CAUSES = 5;
// Fields an error class may define without making them its own (getters, prototype fields)
const ERROR_FIELDS = ['code', 'statusCode', 'status', 'provider', 'providerKey', 'providerId', 'retryable', 'type', 'param'];
// Written separately (message, cause, the provider's response as details), or left out: the
// request and response objects carry credentials, and a query's parameters are already in
// its message
const LEFT_OUT = new Set([
    'name', 'message', 'stack', 'cause', 'details', 'error',
    'request', 'response', 'headers', 'config', 'options', 'meta', 'body', 'params',
]);
// Matched at the end of the key, so apiKey, x-api-key, accessToken and clientSecret are
// redacted while counts like tokens, maxTokens and tokenCount are not
const SECRET_KEY = /(api[-_]?key|password|passwd|secret|token|authorization|cookie|connection[-_]?string|credentials?)$/i;

/** Copy a value with secret-looking keys replaced and long strings cut, safe to log or show. */
export function redactSecrets(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
        return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (${value.length - MAX_STRING} more characters)` : value;
    }
    if (typeof value !== 'object') return value;
    if (depth >= MAX_DEPTH) return '[…]';
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    if (Array.isArray(value)) {
        const items = value.slice(0, 50).map((v) => redactSecrets(v, depth + 1, seen));
        if (value.length > 50) items.push(`… ${value.length - 50} more`);
        return items;
    }
    if (value instanceof Error) {
        return serializeError(value, depth + 1, seen);
    }

    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
        if (typeof v === 'function') continue;
        out[key] = SECRET_KEY.test(key) ? '[Redacted]' : redactSecrets(v, depth + 1, seen);
    }
    return out;
}

/**
 * An error as a plain object for a log line. Unlike { message, stack, name } it keeps
 * the fields the error carries (statusCode, code, a database error's detail), the
 * provider's response body and the cause, and leaves out the request and response objects,
 * whose headers carry credentials.
 */
export function serializeError(err: unknown, depth = 0, seen = new WeakSet<object>()): Record<string, unknown> {
    if (!(err instanceof Error)) {
        return { message: typeof err === 'string' ? err : 'Unknown error', value: redactSecrets(err, depth, seen) };
    }
    if (seen.has(err)) return { message: err.message, circular: true };
    seen.add(err);

    const out: Record<string, unknown> = { name: err.name, message: err.message, stack: err.stack };
    const e = err as unknown as Record<string, unknown>;
    // What the error explains itself with (a database error's detail, table and constraint,
    // a provider's code), whether set as its own fields or on its class
    for (const key of new Set([...ERROR_FIELDS, ...Object.keys(err)])) {
        if (LEFT_OUT.has(key) || e[key] === undefined || typeof e[key] === 'function') continue;
        out[key] = redactSecrets(e[key], depth + 1, seen);
    }
    const body = providerBody(err);
    if (body !== undefined) out.details = redactSecrets(body, depth + 1, seen);
    if (e.cause !== undefined && depth < MAX_DEPTH) out.cause = serializeError(e.cause, depth + 1, seen);
    return out;
}

/** The structured detail for an error. Walks the cause chain for status and code. */
export function toErrorDetail(err: unknown): ErrorDetail {
    if (!(err instanceof Error)) {
        return { message: typeof err === 'string' ? err : 'Unknown error' };
    }

    const detail: ErrorDetail = { message: err.message, name: err.name };
    const causes: string[] = [];
    let current: unknown = err;
    for (let i = 0; current instanceof Error && i <= MAX_CAUSES; i++) {
        const e = current as unknown as Record<string, unknown>;
        if (i > 0 && current.message && !causes.includes(current.message) && current.message !== err.message) {
            causes.push(current.message);
        }
        const status = numberOf(e.statusCode) ?? numberOf(e.status) ?? numberOf((e.meta as Record<string, unknown> | undefined)?.statusCode);
        if (detail.statusCode === undefined && status !== undefined) detail.statusCode = status;
        if (detail.code === undefined && typeof e.code === 'string') detail.code = e.code;
        if (detail.provider === undefined && typeof e.providerKey === 'string') detail.provider = e.providerKey;
        if (detail.retryable === undefined && typeof e.retryable === 'boolean') detail.retryable = e.retryable;
        if (detail.details === undefined) {
            const body = providerBody(current);
            if (body !== undefined) detail.details = redactSecrets(body);
        }
        current = e.cause;
    }
    if (causes.length > 0) detail.causes = causes;
    return detail;
}

function numberOf(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Where each SDK keeps the provider's response: Azure details/bodyAsText, ES meta.body, OpenAI error */
function providerBody(err: unknown): unknown {
    const e = err as Record<string, unknown>;
    if (e.details !== undefined) return e.details;
    const meta = e.meta as Record<string, unknown> | undefined;
    const metaBody = meta?.body as Record<string, unknown> | undefined;
    // null when there was no response at all (connection refused, timeout)
    if (metaBody !== undefined && metaBody !== null) return metaBody.error ?? metaBody;
    const response = e.response as Record<string, unknown> | undefined;
    if (typeof response?.bodyAsText === 'string') return parseMaybeJson(response.bodyAsText);
    if (e.error !== undefined && typeof e.error === 'object') return e.error;
    return undefined;
}

function parseMaybeJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}
