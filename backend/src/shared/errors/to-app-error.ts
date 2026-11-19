// src/shared/errors/to-app-error.ts

/**
 * Turns anything thrown into an AppError for the API response. The feature error
 * classes are matched by name and shape rather than imported, so shared code doesn't
 * depend on features. Provider errors go through classifyUpstream.
 */

import { DrizzleQueryError } from 'drizzle-orm';

import { AppError, ConflictError, INTERNAL_MESSAGE, NotFoundError, ValidationError, codeForStatus } from './app-error';
import { classifyUpstream, explainSearchServiceText, findAIServiceError, isAIProviderFailure } from './upstream';

import { fieldErrorsFromIssues } from '@/shared/validation/validation-messages';

// AIServiceError codes that point at our own configuration
const AI_CONFIG_CODES = new Set(['PROVIDER_NOT_FOUND', 'MODEL_NOT_FOUND', 'PROVIDER_DISABLED', 'PROVIDER_KEY_UNAVAILABLE']);

/**
 * Whatever was thrown, as an AppError. Errors we don't recognise become INTERNAL_ERROR
 * with a generic message; the original stays as the cause for the log.
 */
export function toAppError(err: unknown): AppError {
    if (err instanceof AppError) return err;
    if (!(err instanceof Error)) {
        return new AppError(INTERNAL_MESSAGE, { code: 'INTERNAL_ERROR', status: 500, cause: err });
    }

    const e = err as Error & Record<string, unknown>;

    if (e.name === 'ZodError' && Array.isArray(e.issues)) {
        const issues = e.issues as Array<{ code: string; path: PropertyKey[]; message: string; keys?: string[] }>;
        return new ValidationError('Some values are not valid', fieldErrorsFromIssues(issues));
    }

    switch (e.name) {
        case 'SearchIndexInUseError':
        case 'SecretInUseError':
            return new ConflictError(err.message, { references: e.references });
        case 'FieldHasDependentsError':
            return new ConflictError(err.message, { dependents: e.dependents });
        case 'SearchIndexNotFoundError':
            return new NotFoundError(err.message || 'Search index not found');
        case 'SearchExperienceError':
            if (typeof e.statusCode === 'number' && e.statusCode < 500) {
                return new AppError(err.message, {
                    code: typeof e.code === 'string' ? e.code : codeForStatus(e.statusCode),
                    status: e.statusCode,
                    details: e.details,
                });
            }
            break;
        case 'SearchError': {
            // SearchError carries its status (SEARCH_ERROR_STATUS in the search feature)
            const status = typeof e.status === 'number' ? e.status : 500;
            const code = typeof e.code === 'string' ? e.code : codeForStatus(status);
            // The request was wrong: our own message says how
            if (status < 500) return new AppError(err.message, { code, status });
            // Its AI provider or model is disabled or missing (hybrid search embeds the query): our setup
            const setup = aiConfigError(err);
            if (setup) return setup;
            // The engine or its AI provider failed: explained when we recognise it
            const upstream = classifyUpstream(err);
            if (upstream) return upstream;
            // A provider failure we don't recognise may carry the provider's own text
            return new AppError(code === 'PROVIDER_ERROR' ? INTERNAL_MESSAGE : err.message, { code, status, cause: err });
        }
    }

    // A step that wraps an AI call (analytics synthesis) can fail on our AI setup too. A
    // provider's refused connection is the provider's, so the database comes after it.
    return aiConfigError(err)
        ?? classifyUpstream(err)
        ?? databaseUnavailable(err)
        ?? malformedId(err)
        ?? new AppError(INTERNAL_MESSAGE, { code: 'INTERNAL_ERROR', status: 500, cause: err });
}

// Postgres refusing a value that isn't a UUID where a uuid column is compared (22P02)
const INVALID_TEXT_REPRESENTATION = '22P02';
const NOT_A_UUID = /invalid input syntax for type uuid/i;

/**
 * A query refused because an ID in the request isn't a UUID: the request is wrong, and
 * nothing ran (Postgres rejects the value before running the query). Answered like the
 * routes that check their IDs first, without repeating the value.
 *
 * It can't tell a request's ID from a malformed UUID our own code passed by mistake: such a
 * bug answers 400 and is logged as a warning with its cause, not as a 500 error.
 */
function malformedId(err: Error): AppError | undefined {
    const refused = causeOfQuery(err, (code, cause) => code === INVALID_TEXT_REPRESENTATION && NOT_A_UUID.test(cause.message));
    return refused ? new AppError("That ID isn't valid.", { code: 'BAD_REQUEST', status: 400, cause: err }) : undefined;
}

// Postgres refusing the query for its connection: connection exceptions (08…), shutting
// down or starting up (57P01-57P03), too many connections (53300)
const DB_UNAVAILABLE_SQLSTATE = /^(08[0-9A-Z]{3}|57P0[1-3]|53300)$/;
// The connection itself failed: the driver's (postgres.js) codes and the socket's
const DB_CONNECTION_CODES = new Set([
    'CONNECTION_CLOSED', 'CONNECTION_DESTROYED', 'CONNECTION_ENDED', 'CONNECT_TIMEOUT',
    'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EHOSTUNREACH',
]);
const MAX_CAUSES = 5;

/**
 * A query's error as Drizzle wraps it. Checked by its shape too: a route bundled with its own
 * copy of drizzle-orm (Next.js can load a module once per route) throws a DrizzleQueryError
 * that isn't an instance of ours.
 */
function isQueryError(err: Error): boolean {
    if (err instanceof DrizzleQueryError) return true;
    const e = err as Error & { query?: unknown; params?: unknown };
    return typeof e.query === 'string' && Array.isArray(e.params) && err.message.startsWith('Failed query: ');
}

/**
 * The database couldn't be reached or took no more connections. Only a query's error
 * counts: Drizzle wraps whatever the driver threw for it, so a refused connection
 * elsewhere (a webhook, an MCP server) isn't taken for the database. Nothing about the
 * address is kept; the cause is, for the log.
 */
function databaseUnavailable(err: Error): AppError | undefined {
    const unreachable = causeOfQuery(err, (code) => DB_UNAVAILABLE_SQLSTATE.test(code) || DB_CONNECTION_CODES.has(code));
    if (!unreachable) return undefined;
    return new AppError("The database couldn't be reached.", {
        code: 'DATABASE_UNAVAILABLE',
        status: 503,
        hint: 'Check that Postgres is running and that its connection URL in the deployment settings (DATABASE_URL, or ANALYTICS_POSTGRES_URL for analytics) points at it, then try again.',
        ourSide: true,
        cause: err,
    });
}

/**
 * The error a query failed with (one of err's causes, under the query's error) whose code
 * matches. Only a query's error counts, so the same code from elsewhere isn't taken for it.
 */
function causeOfQuery(err: Error, matches: (code: string, cause: Error) => boolean): Error | undefined {
    let inQuery = false;
    let current: unknown = err;
    for (let i = 0; current instanceof Error && i <= MAX_CAUSES; i++) {
        const code = (current as Error & { code?: unknown }).code;
        if (inQuery && typeof code === 'string' && matches(code, current)) return current;
        if (isQueryError(current)) inQuery = true;
        current = current.cause;
    }
    return undefined;
}

/** An AIServiceError, err or one of its causes, that points at our own AI configuration */
function aiConfigError(err: Error): AppError | undefined {
    const found = findAIServiceError(err, (code) => AI_CONFIG_CODES.has(code));
    return found ? new AppError(found.message, { code: found.code, status: 400, ourSide: true, ...(found !== err && { cause: err }) }) : undefined;
}

/**
 * Whether a failure needs fixing on our side (our setup, or a service we depend on) rather
 * than the request being wrong. status is the one answered with, when it isn't the error's own.
 */
export function isOurFailure(appError: AppError, status: number = appError.status): boolean {
    return status >= 500 || appError.ourSide;
}

/**
 * The level for a failure handled where it happened, by a step that carries on without
 * what failed (a search with the raw query when interpreting it failed): an error when
 * we recognise it as needing a fix on our side (a provider or model that is down,
 * disabled or missing), otherwise the step's own level (a model answer it couldn't read).
 */
export function failureLevel(err: unknown, otherwise: 'error' | 'warn'): 'error' | 'warn' {
    // A circuit breaker that cut the provider off names none, so it isn't classified below
    if (isAIProviderFailure(err)) return 'error';
    const appError = toAppError(err);
    const recognised = appError.code !== 'INTERNAL_ERROR';
    return recognised && isOurFailure(appError) ? 'error' : otherwise;
}

/**
 * A write that failed: a warning when documents were refused, an error when the search
 * service failed as a whole (it's down), blocked writes (a read-only index, a full disk:
 * only an operator can clear it), or the write threw something unexpected (a bug)
 */
export function writeFailureLevel(writeError: unknown, reasons: string[] = []): 'error' | 'warn' {
    if (reasons.some((reason) => explainSearchServiceText(reason))) return 'error';
    if (writeError === undefined) return 'warn';
    if (toAppError(writeError).code === 'INTERNAL_ERROR') return 'error';
    return failureLevel(writeError, 'warn');
}

