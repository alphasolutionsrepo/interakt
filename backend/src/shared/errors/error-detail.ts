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

// Credentials written inside text: a URL's user and password, a key or signature in a
// query or connection string (code only in a query: "status code=500" stays), an api-key
// header written out, an Authorization header's value (raw, or after Bearer, Basic, ApiKey
// or Token). Credentials inside quotes or brackets count too. After a scheme the value
// must have mixed case and 12+ characters, or look like a
// credential (a digit, a symbol or a JWT's dot inside it), so "Basic search.", "Bearer
// token" and "Bearer token-based" stay.
// A port followed by a query (host:3000?email=a@b) is not a password
const URL_USER = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@:]*:(?!\d+[/?#])[^\s/@]+@/gi;
const KEY_VALUE = /((?:^|[?&;#,\s"'(\[{])(?:api[-_]?key|key|(?:[a-z]+[-_]?)?token|sig|signature|password|passwd|secret|client[-_]?secret|accountkey|sharedaccesskey|authorization)=|[?&]code=)(?:'[^']*'|"[^"]*"|\\?["']?[^&;\s"'\\)\]}]+)/gi;
const API_KEY_HEADER = /(\b(?:x-)?api-key\s*:\s*)[^\s,;"']+/gi;
// The whole value, and not one followed by a quote (Basic realm="security" is a challenge)
const AUTH_HEADER = /\b(Bearer|Basic|ApiKey|Token)\s+([\w.~+/=-]{6,})(?![\w.~+/="'-])/gi;

/** A value after an auth scheme that is a credential, not the next word of a sentence */
function looksLikeCredential(value: string): boolean {
    const symbol = /\d|[~+/]|\.\w|=$/.test(value);
    const mixedCase = value.length >= 12 && /[a-z]/.test(value) && /[A-Z]/.test(value);
    return symbol || mixedCase;
}

/** Text with the credentials written inside it replaced */
export function scrubCredentials(text: string): string {
    return text
        .replace(URL_USER, '$1[Redacted]@')
        .replace(KEY_VALUE, '$1[Redacted]')
        .replace(API_KEY_HEADER, '$1[Redacted]')
        .replace(AUTH_HEADER, (match, scheme: string, value: string) => (looksLikeCredential(value) ? `${scheme} [Redacted]` : match));
}

/** Copy a value with secret-looking keys and credentials in text replaced and long strings cut, safe to log or show. */
export function redactSecrets(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
    return redact(value, true, depth, seen);
}

/**
 * The fields of a log line with secret-looking keys and credentials in text replaced and
 * errors expanded. Unlike redactSecrets the fields are not cut; an error keeps the limits
 * serializeError gives it (a provider's answer can be huge).
 */
export function redactLogFields(fields: Record<string, unknown>): Record<string, unknown> {
    const redacted = redact(fields, false, 0, new WeakSet<object>());
    return redacted !== null && typeof redacted === 'object' ? (redacted as Record<string, unknown>) : { logFields: redacted };
}

// Logging never throws: a value that throws when read (a getter, toJSON, a revoked Proxy)
// is written as this, and the values around it as they are
const UNREADABLE = '[Unreadable]';

function redact(value: unknown, cut: boolean, depth: number, seen: WeakSet<object>): unknown {
    try {
        return redactValue(value, cut, depth, seen);
    } catch {
        return UNREADABLE;
    }
}

/** An error's name, message or stack as text without credentials, whatever was put there */
function textOf(err: Error, key: 'name' | 'message' | 'stack'): string | undefined {
    const value = read(err, key);
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') return scrubCredentials(value);
    try {
        return JSON.stringify(redactSecrets(value)) ?? UNREADABLE;
    } catch {
        return UNREADABLE;
    }
}

/** A property's value, or UNREADABLE when reading it throws */
function read(value: object, key: string): unknown {
    try {
        return (value as Record<string, unknown>)[key];
    } catch {
        return UNREADABLE;
    }
}

function redactValue(value: unknown, cut: boolean, depth: number, seen: WeakSet<object>): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
        const text = scrubCredentials(value);
        return cut && text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}… (${text.length - MAX_STRING} more characters)` : text;
    }
    if (typeof value !== 'object') return value;
    // In a log line an error counts its limits from itself, as it did when pino expanded it
    if (value instanceof Error) {
        return serializeError(value, cut ? depth + 1 : 0, seen);
    }
    // What JSON would write for it: a Date or URL as its text. Like JSON, toJSON is called
    // once, not again on what it returns
    const json = (value as { toJSON?: unknown }).toJSON;
    if (typeof json !== 'function') return walk(value, cut, depth, seen);
    const written: unknown = json.call(value);
    return written !== null && typeof written === 'object' ? walk(written, cut, depth, seen) : redact(written, cut, depth, seen);
}

function walk(value: object, cut: boolean, depth: number, seen: WeakSet<object>): unknown {
    if (cut && depth >= MAX_DEPTH) return '[…]';
    // Only a value inside itself is circular; one reached twice side by side is written twice
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            const kept = cut ? value.slice(0, 50) : value;
            const items = kept.map((v) => redact(v, cut, depth + 1, seen));
            if (kept.length < value.length) items.push(`… ${value.length - 50} more`);
            return items;
        }
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value)) {
            if (SECRET_KEY.test(key)) {
                out[key] = '[Redacted]';
                continue;
            }
            const v = read(value, key);
            if (typeof v !== 'function') out[key] = redact(v, cut, depth + 1, seen);
        }
        return out;
    } finally {
        seen.delete(value);
    }
}

/**
 * An error as a plain object for a log line. Unlike { message, stack, name } it keeps
 * the fields the error carries (statusCode, code, a database error's detail), the
 * provider's response body and the cause, and leaves out the request and response objects,
 * whose headers carry credentials.
 */
export function serializeError(err: unknown, depth = 0, seen = new WeakSet<object>()): Record<string, unknown> {
    if (!(err instanceof Error)) {
        return { message: typeof err === 'string' ? scrubCredentials(err) : 'Unknown error', value: redactSecrets(err, depth, seen) };
    }
    if (seen.has(err)) return { message: textOf(err, 'message'), circular: true };
    seen.add(err);
    try {
        return expandError(err, depth, seen);
    } finally {
        seen.delete(err);
    }
}

function expandError(err: Error, depth: number, seen: WeakSet<object>): Record<string, unknown> {
    const out: Record<string, unknown> = { name: textOf(err, 'name'), message: textOf(err, 'message'), stack: textOf(err, 'stack') };
    // What the error explains itself with (a database error's detail, table and constraint,
    // a provider's code), whether set as its own fields or on its class
    for (const key of new Set([...ERROR_FIELDS, ...Object.keys(err)])) {
        const value = LEFT_OUT.has(key) ? undefined : read(err, key);
        if (value === undefined || typeof value === 'function') continue;
        out[key] = redactSecrets(value, depth + 1, seen);
    }
    let body: unknown;
    try {
        body = redactSecrets(providerBody(err), depth + 1, seen);
    } catch {
        body = UNREADABLE;
    }
    if (body !== undefined) out.details = body;
    const cause = read(err, 'cause');
    if (cause !== undefined && depth < MAX_DEPTH) out.cause = serializeError(cause, depth + 1, seen);
    // An AggregateError's own errors aren't enumerable: Node's fetch to localhost fails with
    // one per address tried (::1, 127.0.0.1), and they are what says ECONNREFUSED where
    // (a ZodError's errors are its issues, not errors, and are in its details)
    const errors = err instanceof AggregateError ? read(err, 'errors') : undefined;
    if (Array.isArray(errors) && errors.length > 0 && depth < MAX_DEPTH) {
        out.errors = errors.slice(0, 5).map((e) => serializeError(e, depth + 1, seen));
    }
    return out;
}

/** The structured detail for an error. Walks the cause chain for status and code. */
export function toErrorDetail(err: unknown): ErrorDetail {
    if (!(err instanceof Error)) {
        return { message: typeof err === 'string' ? scrubCredentials(err) : 'Unknown error' };
    }

    const detail: ErrorDetail = { message: textOf(err, 'message') ?? '', name: textOf(err, 'name') };
    const causes: string[] = [];
    let current: unknown = err;
    for (let i = 0; current instanceof Error && i <= MAX_CAUSES; i++) {
        const e = current as unknown as Record<string, unknown>;
        const message = textOf(current, 'message');
        if (i > 0 && message && !causes.includes(message) && message !== detail.message) {
            causes.push(message);
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
