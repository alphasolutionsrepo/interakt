// src/shared/errors/to-app-error.ts

/**
 * Turns anything thrown into an AppError for the API response. The feature error
 * classes are matched by name and shape rather than imported, so shared code doesn't
 * depend on features. Provider errors go through classifyUpstream.
 */

import { AppError, ConflictError, INTERNAL_MESSAGE, NotFoundError, ValidationError, codeForStatus } from './app-error';
import { classifyUpstream, explainSearchServiceText, isAIProviderFailure } from './upstream';

// AIServiceError codes that point at our own configuration
const AI_CONFIG_CODES = new Set(['PROVIDER_NOT_FOUND', 'MODEL_NOT_FOUND', 'PROVIDER_DISABLED']);

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
        const fields = (e.issues as Array<{ path: (string | number)[]; message: string }>).map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
        }));
        return new ValidationError('Some values are not valid', fields);
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
            // The engine or its AI provider failed: explained when we recognise it
            const upstream = classifyUpstream(err);
            if (upstream) return upstream;
            // A provider failure we don't recognise may carry the provider's own text
            return new AppError(code === 'PROVIDER_ERROR' ? INTERNAL_MESSAGE : err.message, { code, status, cause: err });
        }
        case 'AIServiceError':
            if (typeof e.code === 'string' && AI_CONFIG_CODES.has(e.code)) {
                return new AppError(err.message, { code: e.code, status: 400, ourSide: true });
            }
            break;
    }

    return classifyUpstream(err) ?? new AppError(INTERNAL_MESSAGE, { code: 'INTERNAL_ERROR', status: 500, cause: err });
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

