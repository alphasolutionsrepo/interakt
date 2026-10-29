// src/shared/errors/to-app-error.ts

/**
 * Turns anything thrown into an AppError for the API response. The feature error
 * classes are matched by name and shape rather than imported, so shared code doesn't
 * depend on features. Provider errors go through classifyUpstream.
 */

import { AppError, ConflictError, INTERNAL_MESSAGE, NotFoundError, ValidationError, codeForStatus } from './app-error';
import { classifyUpstream } from './upstream';

// SearchError codes that mean the request was wrong, not that the engine failed
const SEARCH_REQUEST_CODES = new Set([
    'INVALID_QUERY', 'INVALID_FILTER', 'INVALID_FACET', 'INVALID_SORT',
    'FIELD_NOT_FOUND', 'FIELD_NOT_SEARCHABLE', 'FIELD_NOT_FACETABLE',
]);
// AIServiceError codes that point at our own configuration
const AI_CONFIG_CODES = new Set(['PROVIDER_NOT_FOUND', 'MODEL_NOT_FOUND', 'PROVIDER_DISABLED']);

/**
 * Whatever was thrown, as an AppError. Errors we don't recognise become INTERNAL
 * with a generic message; the original stays as the cause for the log.
 */
export function toAppError(err: unknown): AppError {
    if (err instanceof AppError) return err;
    if (!(err instanceof Error)) {
        return new AppError(INTERNAL_MESSAGE, { code: 'INTERNAL', status: 500, cause: err });
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
        case 'SearchError':
            if (e.code === 'INDEX_NOT_FOUND') return new NotFoundError(err.message);
            if (typeof e.code === 'string' && SEARCH_REQUEST_CODES.has(e.code)) {
                return new AppError(err.message, { code: e.code, status: 400 });
            }
            break;
        case 'AIServiceError':
            if (typeof e.code === 'string' && AI_CONFIG_CODES.has(e.code)) {
                return new AppError(err.message, { code: e.code, status: 400 });
            }
            break;
    }

    return classifyUpstream(err) ?? new AppError(INTERNAL_MESSAGE, { code: 'INTERNAL', status: 500, cause: err });
}
