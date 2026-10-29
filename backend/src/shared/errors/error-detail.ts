// src/shared/errors/error-detail.ts

/**
 * Turns any thrown error into something an admin can read: the message, what the
 * provider said (status, code, response body), the chain of causes, and a short hint
 * on what to try. Provider SDK errors carry the useful part in different places
 * (Azure RestError: statusCode/code/details, Elasticsearch: meta.body.error, OpenAI:
 * status/error), and the request headers next to it hold API keys, so everything goes
 * through redactSecrets before it is logged or shown.
 *
 * No Node-only imports: the logger uses this, and the logger is loaded everywhere.
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
    /** A suggestion in plain words, when the error is one we recognise */
    hint?: string;
}

const MAX_STRING = 4000;
const MAX_DEPTH = 6;
const MAX_CAUSES = 5;
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
 * what providers attach (statusCode, code, details, response body) and the cause,
 * and leaves out the request, whose headers carry credentials.
 */
export function serializeError(err: unknown, depth = 0, seen = new WeakSet<object>()): Record<string, unknown> {
    if (!(err instanceof Error)) {
        return { message: typeof err === 'string' ? err : 'Unknown error', value: redactSecrets(err, depth, seen) };
    }
    if (seen.has(err)) return { message: err.message, circular: true };
    seen.add(err);

    const out: Record<string, unknown> = { name: err.name, message: err.message, stack: err.stack };
    const e = err as unknown as Record<string, unknown>;
    for (const key of ['code', 'statusCode', 'status', 'providerKey', 'providerId', 'retryable', 'type', 'param']) {
        if (e[key] !== undefined && typeof e[key] !== 'function') out[key] = e[key];
    }
    const body = providerBody(err);
    if (body !== undefined) out.details = redactSecrets(body, depth + 1, seen);
    if (e.cause !== undefined && depth < MAX_DEPTH) out.cause = serializeError(e.cause, depth + 1, seen);
    return out;
}

/** The structured detail for an error, with its hint. Walks the cause chain for status and code. */
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

    const hint = hintFor(detail);
    if (hint) detail.hint = hint;
    return detail;
}

/**
 * A suggestion for errors we recognise. Matches on status, code and the text of the
 * message and its causes, since providers word the same problem differently.
 */
export function hintFor(detail: Pick<ErrorDetail, 'message' | 'statusCode' | 'code' | 'causes' | 'details'>): string | undefined {
    const text = [detail.message, detail.code, ...(detail.causes ?? []), typeof detail.details === 'string' ? detail.details : JSON.stringify(detail.details ?? '')]
        .join(' ')
        .toLowerCase();
    const status = detail.statusCode;

    if (/dimension/.test(text) && /vector|embedding|dims/.test(text)) {
        return "The embedding model's vector size doesn't match the index. Pick a model with the same dimensions, or change the AI configuration and reindex.";
    }
    if (/insufficient_quota|quota exceeded|exceeded your current quota/.test(text)) {
        return 'The AI provider account is out of quota. Check billing or limits with the provider.';
    }
    if (status === 429 || /rate.?limit|too many requests/.test(text)) {
        return 'The provider is limiting how many requests it accepts. Wait a minute and try again.';
    }
    if (status === 401 || status === 403 || /unauthorized|forbidden|authentication|invalid api key|access denied/.test(text)) {
        return 'The service rejected the credentials. Check the API key or secret configured for the search service or AI provider.';
    }
    if (/econnrefused|enotfound|etimedout|econnreset|fetch failed|socket hang up|getaddrinfo/.test(text)) {
        return "The service couldn't be reached. Check its endpoint URL and that it is running.";
    }
    if (status === 413 || /request entity too large|payload too large|request is too large/.test(text)) {
        return 'The request was too large for the provider. Upload fewer or smaller documents at a time.';
    }
    if (/index_not_found|index .* (was )?not found|no such index|index does not exist/.test(text)) {
        return "The index doesn't exist on the search service. Use Recreate Index, then upload or reindex the documents.";
    }
    if (/resource_already_exists|already exists/.test(text)) {
        return 'Something with this name already exists on the search service.';
    }
    if (/mapper_parsing|illegal_argument|invalidrequestparameter|invalid ?field|cannot be changed|is not a valid/.test(text)) {
        return 'The search service rejected the index definition. Check the field settings named in the log.';
    }
    if (status !== undefined && status >= 500) {
        return 'The provider had an internal error. Trying again usually works.';
    }
    return undefined;
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
    if (metaBody !== undefined) return metaBody.error ?? metaBody;
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
