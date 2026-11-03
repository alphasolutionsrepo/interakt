// src/shared/errors/upstream.ts

/**
 * Translates errors from the services we call (Azure AI Search, Elasticsearch, the AI
 * providers) into a small set of codes, each with a message and a hint the user can
 * act on. Most real failures come from these services, so this is where an error
 * stops being "Something went wrong".
 *
 * The provider is worked out from the error's shape anywhere in its cause chain:
 * Azure RestError, Elasticsearch meta.body, OpenAI-style status + error, the
 * providerKey our AI adapters attach, or an external search source's ExternalSearchError. Errors from anywhere else are not classified.
 *
 * Everything returned is redacted and short: it ends up in the browser.
 */

import { type AppError, UpstreamError } from './app-error';
import { redactSecrets, toErrorDetail } from './error-detail';

export type UpstreamCode =
    | 'UPSTREAM_AUTH'
    | 'UPSTREAM_QUOTA'
    | 'UPSTREAM_RATE_LIMITED'
    | 'UPSTREAM_SCHEMA_MISMATCH'
    | 'UPSTREAM_DIMENSION_MISMATCH'
    | 'UPSTREAM_READ_ONLY'
    | 'UPSTREAM_TIMEOUT'
    | 'UPSTREAM_UNAVAILABLE'
    | 'UPSTREAM_ERROR';

export interface UpstreamDetails {
    provider: string;
    status?: number;
    code?: string;
    message?: string;
}

type ProviderKind = 'search' | 'ai' | 'external';

interface Provider {
    name: string;
    kind: ProviderKind;
    /** The provider's own error in the chain: the details come from it, not from our wrappers */
    error: Error;
}

const MAX_MESSAGE = 300;
const MAX_CAUSES = 5;

const AI_PROVIDER_NAMES: Record<string, string> = {
    openai: 'OpenAI',
    'azure-openai': 'Azure OpenAI',
    azure_openai: 'Azure OpenAI',
    ollama: 'Ollama',
    anthropic: 'Anthropic',
};

const SETTINGS: Record<ProviderKind, string> = {
    search: "the search service's endpoint and admin key in the deployment settings",
    ai: 'the provider under AI Providers',
    external: "the data source's connection settings",
};

/** What each code tells the user. {provider} is the service's name; {settings} where to fix it. */
const COPY: Record<UpstreamCode, { status: number; message: string; hint?: string }> = {
    UPSTREAM_AUTH: {
        status: 502,
        message: '{provider} rejected the credentials.',
        hint: 'Check {settings}, then try again.',
    },
    UPSTREAM_QUOTA: {
        status: 502,
        message: '{provider} account is out of quota.',
        hint: 'Check billing and usage limits with {provider}, or switch to another model under AI Providers.',
    },
    UPSTREAM_RATE_LIMITED: {
        status: 503,
        message: '{provider} is limiting requests right now.',
        hint: 'Wait a minute and try again. If it keeps happening, raise the rate limit with {provider}.',
    },
    UPSTREAM_SCHEMA_MISMATCH: {
        status: 502,
        message: '{provider} rejected the index definition.',
        hint: 'A field setting is not allowed or cannot be changed on an existing index. Check the field named in the details, or recreate the index.',
    },
    UPSTREAM_DIMENSION_MISMATCH: {
        status: 502,
        message: "The embedding size doesn't match the index.",
        hint: 'Pick an embedding model with the same dimensions, or change the AI configuration of the index and reindex.',
    },
    UPSTREAM_READ_ONLY: {
        status: 503,
        message: '{provider} is refusing writes to this index.',
        hint: 'The index is read-only, most often because the search service is low on disk space. Free disk space or raise its disk limits, clear the read-only block on the index, then try again.',
    },
    UPSTREAM_TIMEOUT: {
        status: 504,
        message: "{provider} didn't respond in time.",
        hint: 'Try again. For large jobs, try fewer documents at a time.',
    },
    UPSTREAM_UNAVAILABLE: {
        status: 503,
        message: "{provider} couldn't be reached.",
        hint: 'Check that the service is running and that {settings} are correct, then try again.',
    },
    UPSTREAM_ERROR: {
        status: 502,
        message: '{provider} returned an error.',
    },
};

/** Map an AIServiceError code onto an upstream code, when it is about the provider */
const AI_SERVICE_CODES: Record<string, UpstreamCode> = {
    AUTHENTICATION_FAILED: 'UPSTREAM_AUTH',
    RATE_LIMITED: 'UPSTREAM_RATE_LIMITED',
    TIMEOUT: 'UPSTREAM_TIMEOUT',
    NETWORK_ERROR: 'UPSTREAM_UNAVAILABLE',
    PROVIDER_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
    CIRCUIT_OPEN: 'UPSTREAM_UNAVAILABLE',
};

/** The upstream error behind err, or undefined when no provider is involved */
export function classifyUpstream(err: unknown): AppError | undefined {
    const provider = findProvider(err);
    if (!provider) return undefined;

    // Read from the provider's own error, not our wrappers: their codes and details
    // (an index name, PROVIDER_ERROR) would pick the wrong explanation
    const detail = toErrorDetail(provider.error);
    const serviceCode = aiServiceCode(err) ?? transportCode(err);
    const found = serviceCode ?? codeFor(detail.statusCode, [detail.message, detail.code, ...(detail.causes ?? []), stringify(detail.details)].join(' '));
    // Advice about the index definition is for writes, never for a search: external sources
    // are only searched, and Elasticsearch names a refused search search_phase_execution_exception
    const searched = provider.kind === 'external' || /search_phase_execution_exception/.test(detail.message);
    const code = searched && found === 'UPSTREAM_SCHEMA_MISMATCH' ? 'UPSTREAM_ERROR' : found;
    const copy = COPY[code];
    const fill = (text: string) => text.replaceAll('{provider}', provider.name).replaceAll('{settings}', SETTINGS[provider.kind]);

    const message = scrub(upstreamMessage(provider.error, detail.details));
    const details: UpstreamDetails = {
        provider: provider.name,
        // Status 0 means no response at all, not a status the provider sent
        ...(detail.statusCode && { status: detail.statusCode }),
        ...(detail.code !== undefined && { code: detail.code }),
        ...(message && { message }),
    };

    return new UpstreamError(fill(copy.message), {
        code,
        status: copy.status,
        ...(copy.hint && { hint: fill(copy.hint) }),
        details,
        cause: err,
    });
}

/**
 * The explanation for a write block in a search service's error text. Per-document
 * errors from a bulk write arrive as text, not as an error (Elasticsearch answers the
 * bulk request with 200 and puts the block on each document). Only write blocks: the
 * same list holds our own field-mapping problems, which aren't the search service's.
 */
export function explainSearchServiceText(text: string): { code: UpstreamCode; message: string; hint?: string } | undefined {
    const code = codeFor(undefined, text);
    if (code !== 'UPSTREAM_READ_ONLY') return undefined;
    const copy = COPY[code];
    const fill = (t: string) => t.replaceAll('{provider}', 'The search service').replaceAll('{settings}', SETTINGS.search);
    return { code, message: fill(copy.message), ...(copy.hint && { hint: fill(copy.hint) }) };
}

/**
 * Why a write to a search service failed, and what to do: from the error that failed it
 * (the service couldn't be reached, timed out) when we recognise it, else the service's
 * own reason text, with a hint for write blocks. The raw error is still in the log.
 */
export function explainWriteFailure(writeError: unknown, reason: string | undefined): { reason?: string; hint?: string } {
    const upstream = writeError !== undefined ? classifyUpstream(writeError) : undefined;
    if (upstream) return { reason: upstream.message, ...(upstream.hint && { hint: upstream.hint }) };
    const hint = reason ? explainSearchServiceText(reason)?.hint : undefined;
    return { ...(reason && { reason }), ...(hint && { hint }) };
}

function codeFor(status: number | undefined, rawText: string): UpstreamCode {
    const text = rawText.toLowerCase();
    // Elasticsearch blocks writes with a 403 (read-only index) or a 429 (disk full):
    // neither is about credentials or rate limits, so this comes before both
    const block = text.indexOf('blocked by: [');
    if (block >= 0) {
        // What follows "blocked by: [", e.g. "forbidden/8/index write (api)]"
        const reason = text.slice(block, block + 200);
        if (/index write|read[-_ ]only|flood-stage|disk usage/.test(reason)) return 'UPSTREAM_READ_ONLY';
        // Any other block on an index (reads, metadata) is not a credentials problem
        // either; a cluster that isn't ready (503) falls through to unavailable
        if (status !== 503) return 'UPSTREAM_ERROR';
    }
    if (/dimension/.test(text) && /vector|embedding|dims/.test(text)) return 'UPSTREAM_DIMENSION_MISMATCH';
    if (/insufficient_quota|quota exceeded|exceeded your current quota|out of quota/.test(text)) return 'UPSTREAM_QUOTA';
    if (status === 429 || /rate.?limit|too many requests/.test(text)) return 'UPSTREAM_RATE_LIMITED';
    if (status === 401 || status === 403 || /unauthorized|forbidden|authentication|invalid api key|access denied/.test(text)) return 'UPSTREAM_AUTH';
    if (status === 408 || status === 504 || /timed? ?out|etimedout|timeout/.test(text)) return 'UPSTREAM_TIMEOUT';
    if (status === 502 || status === 503 || /econnrefused|enotfound|econnreset|fetch failed|socket hang up|getaddrinfo|serviceunavailable|no living connections/.test(text)) {
        return 'UPSTREAM_UNAVAILABLE';
    }
    if (/mapper_parsing|illegal_argument|invalidrequestparameter|invalid ?field|cannot be changed|is not a valid|mapping/.test(text)) {
        return 'UPSTREAM_SCHEMA_MISMATCH';
    }
    return 'UPSTREAM_ERROR';
}

function findProvider(err: unknown): Provider | undefined {
    let current: unknown = err;
    for (let i = 0; current instanceof Error && i <= MAX_CAUSES; i++) {
        const e = current as Error & Record<string, unknown>;
        if (typeof e.providerKey === 'string') {
            return { name: AI_PROVIDER_NAMES[e.providerKey] ?? e.providerKey, kind: 'ai', error: e };
        }
        if (e.name === 'RestError') return { name: 'Azure AI Search', kind: 'search', error: e };
        // An external search source's engine (data-source/external-search)
        if (e.name === 'ExternalSearchError' && typeof e.provider === 'string') return { name: e.provider, kind: 'external', error: e };
        if (isElasticsearchError(e)) return { name: 'Elasticsearch', kind: 'search', error: e };
        if (typeof e.status === 'number' && e.error !== undefined && typeof e.error === 'object') {
            return { name: 'The AI provider', kind: 'ai', error: e };
        }
        current = e.cause;
    }
    return undefined;
}

function isElasticsearchError(e: Record<string, unknown>): boolean {
    const meta = e.meta as Record<string, unknown> | undefined;
    return !!meta && typeof meta === 'object' && ('body' in meta || 'statusCode' in meta || 'meta' in meta);
}

function aiServiceCode(err: unknown): UpstreamCode | undefined {
    let current: unknown = err;
    for (let i = 0; current instanceof Error && i <= MAX_CAUSES; i++) {
        const e = current as Error & Record<string, unknown>;
        if (e.name === 'AIServiceError' && typeof e.code === 'string' && AI_SERVICE_CODES[e.code]) return AI_SERVICE_CODES[e.code];
        current = e.cause;
    }
    return undefined;
}

/**
 * Elasticsearch client errors that say what happened only by their name: a
 * ConnectionError has an empty message and status 0 when the cluster is down.
 */
const TRANSPORT_ERROR_CODES: Record<string, UpstreamCode> = {
    ConnectionError: 'UPSTREAM_UNAVAILABLE',
    NoLivingConnectionsError: 'UPSTREAM_UNAVAILABLE',
    TimeoutError: 'UPSTREAM_TIMEOUT',
};

function transportCode(err: unknown): UpstreamCode | undefined {
    let current: unknown = err;
    for (let i = 0; current instanceof Error && i <= MAX_CAUSES; i++) {
        const e = current as Error & Record<string, unknown>;
        if (isElasticsearchError(e) && TRANSPORT_ERROR_CODES[e.name]) return TRANSPORT_ERROR_CODES[e.name];
        current = e.cause;
    }
    return undefined;
}

/** The provider's own words: from its response body when there is one, else the deepest message */
function upstreamMessage(err: unknown, body: unknown): string {
    if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        const inner = (b.error && typeof b.error === 'object' ? b.error : b) as Record<string, unknown>;
        // Elasticsearch's root cause says what failed; its top-level reason is often "all shards failed"
        const rootCause = Array.isArray(inner.root_cause) ? (inner.root_cause[0] as Record<string, unknown> | undefined)?.reason : undefined;
        if (typeof rootCause === 'string') return rootCause;
        for (const key of ['message', 'reason']) {
            if (typeof inner[key] === 'string') return inner[key] as string;
        }
    }
    if (typeof body === 'string' && body.trim()) return body;

    let deepest = err instanceof Error ? err.message : String(err);
    let current: unknown = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
    for (let i = 0; current instanceof Error && i < MAX_CAUSES; i++) {
        if (current.message) deepest = current.message;
        current = (current as Error & { cause?: unknown }).cause;
    }
    return deepest;
}

/** Remove anything that looks like a credential and cut to a readable length */
export function scrub(text: string): string {
    const cleaned = String(redactSecrets(text))
        // key=value pairs in query strings or connection strings
        .replace(/((?:api[-_]?key|key|code|sig|token|password|secret|accountkey|sharedaccesskey)\s*[=:]\s*)[^&;\s"']+/gi, '$1[Redacted]')
        // bearer and basic auth
        .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [Redacted]')
        // credentials in URLs: https://user:pass@host
        .replace(/(\w+:\/\/)[^/\s:@]+:[^/\s@]+@/g, '$1[Redacted]@')
        // long opaque strings that look like keys
        .replace(/\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{32,}={0,2}/g, '[Redacted]');
    return cleaned.length > MAX_MESSAGE ? `${cleaned.slice(0, MAX_MESSAGE)}…` : cleaned;
}

function stringify(value: unknown): string {
    if (value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch {
        return '';
    }
}
