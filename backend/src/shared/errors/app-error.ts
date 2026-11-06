// src/shared/errors/app-error.ts

/**
 * Errors the API can explain to the user. An AppError carries everything the error
 * response needs: a stable code, the HTTP status, a message in plain words, what to
 * try (hint), per-field problems for forms, and redacted technical details.
 *
 * to-app-error.ts turns anything thrown into one.
 */

export interface FieldError {
    field: string;
    message: string;
}

export interface AppErrorOptions {
    code: string;
    status: number;
    hint?: string;
    fields?: FieldError[];
    details?: unknown;
    cause?: unknown;
    /**
     * The request was fine: our setup or a service we depend on is at fault (a disabled
     * AI provider, a model that is gone). Logged as an error, whatever the status.
     */
    ourSide?: boolean;
}

export const INTERNAL_MESSAGE = 'Something went wrong on the server. Try again, and if it keeps happening, contact support with the request id.';

export class AppError extends Error {
    readonly code: string;
    readonly status: number;
    readonly hint?: string;
    readonly fields?: FieldError[];
    readonly details?: unknown;
    readonly ourSide: boolean;

    constructor(message: string, options: AppErrorOptions) {
        super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
        this.name = 'AppError';
        this.code = options.code;
        this.status = options.status;
        this.hint = options.hint;
        this.fields = options.fields;
        this.details = options.details;
        this.ourSide = options.ourSide ?? false;
    }
}

export class ValidationError extends AppError {
    constructor(message: string, fields?: FieldError[]) {
        super(message, { code: 'VALIDATION_ERROR', status: 400, fields });
        this.name = 'ValidationError';
    }
}

export class NotFoundError extends AppError {
    constructor(message: string = 'Not found') {
        super(message, { code: 'NOT_FOUND', status: 404 });
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends AppError {
    constructor(message: string, details?: unknown) {
        super(message, { code: 'CONFLICT', status: 409, details });
        this.name = 'ConflictError';
    }
}

/** Something the admin has to set up first (a default model, an API key); the message says what */
export class SetupRequiredError extends AppError {
    constructor(message: string) {
        super(message, { code: 'SETUP_REQUIRED', status: 400 });
        this.name = 'SetupRequiredError';
    }
}

/** A third-party service (search engine, AI provider) failed; details say which and how */
export class UpstreamError extends AppError {
    constructor(message: string, options: AppErrorOptions) {
        super(message, options);
        this.name = 'UpstreamError';
    }
}

/** The code that goes with a status, for errors raised with only a status */
export function codeForStatus(status: number): string {
    if (status === 400) return 'BAD_REQUEST';
    if (status === 401) return 'UNAUTHORIZED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) return 'CONFLICT';
    if (status === 422) return 'VALIDATION_ERROR';
    if (status >= 500) return 'INTERNAL_ERROR';
    return 'ERROR';
}
