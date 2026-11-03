// src/shared/api/response.ts

/**
 * Standardized API Response Builder
 * Provides consistent response format across all API endpoints
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { isPublicRequest } from './public-route';
import { currentRequestId, requestIdFor } from './request-id';

import { type FieldError, INTERNAL_MESSAGE, codeForStatus } from '@/shared/errors/app-error';
import { toAppError } from '@/shared/errors/to-app-error';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('api');

export interface APISuccessResponse<T = any> {
    success: true;
    data: T;
    pagination?: {
        page: number;
        pageSize: number;
        totalPages: number;
        totalItems: number;
    };
}

/**
 * Every error response has this shape. message says what happened in plain words,
 * hint what to do, fields which form fields are wrong, details the technical part
 * (the provider, its status and its own message, redacted). requestId is on the
 * server log line for the error, so support can find it.
 */
export interface APIErrorResponse {
    success: false;
    code: string;
    message: string;
    /** Same as message; kept for clients that read error */
    error: string;
    hint?: string;
    fields?: FieldError[];
    details?: any;
    requestId: string;
}

interface ErrorBody {
    code: string;
    message: string;
    hint?: string;
    fields?: FieldError[];
    details?: unknown;
}

/** What visitors of the widget and API clients read when the server side failed */
export const PUBLIC_FAILURE_MESSAGE = 'The service is temporarily unavailable. Try again in a moment.';

function errorResponse(body: ErrorBody, status: number, requestId: string = currentRequestId()): NextResponse<APIErrorResponse> {
    return NextResponse.json(errorPayload(body, status, requestId), { status });
}

function errorPayload(body: ErrorBody, status: number, requestId: string): APIErrorResponse {
    const publicRequest = isPublicRequest();
    // Visitors of the widget and API clients don't get to see which service failed or how:
    // not its name, its hint or its details. The code and request id are kept for support.
    const internal = publicRequest && status >= 500;
    const message = internal ? PUBLIC_FAILURE_MESSAGE : body.message;
    // The public API documents per-field problems as details (OpenAPI ErrorResponse)
    const details = body.details ?? (publicRequest && body.fields?.length ? body.fields : undefined);
    return {
        success: false as const,
        code: body.code,
        message,
        error: message,
        ...(body.hint && !internal && { hint: body.hint }),
        ...(body.fields?.length && { fields: body.fields }),
        ...(details !== undefined && !internal && { details }),
        requestId,
    };
}

/**
 * Success response
 */
function success<T>(data: T, status: number = 200): NextResponse<APISuccessResponse<T>> {
    return NextResponse.json(
        {
            success: true,
            data,
        },
        { status }
    );
}

/**
 * Success response with pagination
 */
function successWithPagination<T>(
    data: T,
    pagination: {
        page: number;
        pageSize: number;
        totalPages: number;
        totalItems: number;
    },
    status: number = 200
): NextResponse<APISuccessResponse<T>> {
    return NextResponse.json(
        {
            success: true,
            data,
            pagination,
        },
        { status }
    );
}

/**
 * Error response for anything thrown. Errors we recognise (AppError, the feature
 * errors, provider errors) answer with their own status, message and hint; others
 * get a generic message. A string is our own message and is shown as it is.
 * status is used when the error doesn't carry one of its own.
 */
function error(err: unknown, status: number = 500): NextResponse<APIErrorResponse> {
    const described = describeError(err, status);
    return NextResponse.json(described.body, { status: described.status });
}

/**
 * The error body and status apiResponse.error answers with, logged the same way, for
 * answers that aren't a JSON response of their own (an error event in a stream).
 * logContext is added to the log line (say, which experience failed).
 */
export function describeError(
    err: unknown,
    status: number = 500,
    logContext?: Record<string, unknown>
): { status: number; body: APIErrorResponse } {
    // The same id the failure was recorded with elsewhere (a job on the index)
    const requestId = typeof err === 'string' ? currentRequestId() : requestIdFor(err);

    if (typeof err === 'string') {
        if (status >= 500) logger.error(err, undefined, { ...logContext, requestId });
        return { status, body: errorPayload({ code: codeForStatus(status), message: err }, status, requestId) };
    }

    const appError = toAppError(err);
    const recognised = appError.code !== 'INTERNAL_ERROR';
    const finalStatus = recognised ? appError.status : status;
    const message = recognised
        ? appError.message
        // The caller chose a 4xx for this error: its message is meant for the user
        : finalStatus < 500 && err instanceof Error ? err.message : INTERNAL_MESSAGE;

    if (finalStatus >= 500) {
        logger.error('Request failed', err instanceof Error ? err : new Error(String(err)), {
            ...logContext,
            requestId,
            code: appError.code,
            ...(appError.details !== undefined && { details: appError.details }),
        });
    } else {
        logger.warn('Request rejected', { ...logContext, requestId, code: appError.code, message });
    }

    return {
        status: finalStatus,
        body: errorPayload(
            {
                code: recognised ? appError.code : codeForStatus(finalStatus),
                message,
                hint: appError.hint,
                fields: appError.fields,
                details: appError.details,
            },
            finalStatus,
            requestId
        ),
    };
}

/**
 * Validation error (Zod)
 */
function validationError(zodError: ZodError): NextResponse<APIErrorResponse> {
    return errorResponse(
        {
            code: 'VALIDATION_ERROR',
            message: 'Some values are not valid',
            fields: zodError.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message,
            })),
        },
        400
    );
}

/**
 * Not found error
 */
function notFound(message: string = 'Resource not found'): NextResponse<APIErrorResponse> {
    return errorResponse({ code: 'NOT_FOUND', message }, 404);
}

/**
 * Bad request error
 */
function badRequest(message: string): NextResponse<APIErrorResponse> {
    return errorResponse({ code: 'BAD_REQUEST', message }, 400);
}

/**
 * Unauthorized error
 */
function unauthorized(message: string = 'Unauthorized'): NextResponse<APIErrorResponse> {
    return errorResponse({ code: 'UNAUTHORIZED', message }, 401);
}

/**
 * Forbidden error
 */
function forbidden(message: string = 'Forbidden'): NextResponse<APIErrorResponse> {
    return errorResponse({ code: 'FORBIDDEN', message }, 403);
}

/**
 * Conflict error (409)
 *
 * `details` carries machine-readable context about what conflicted — e.g. the
 * list of things blocking a delete — so the client can render it rather than
 * only showing the message.
 */
function conflict(message: string, details?: any): NextResponse<APIErrorResponse> {
    return errorResponse({ code: 'CONFLICT', message, details }, 409);
}

/**
 * Internal server error
 */
function internalError(message: string = 'Internal server error'): NextResponse<APIErrorResponse> {
    return errorResponse({ code: 'INTERNAL_ERROR', message }, 500);
}

// Export all response builders
export const apiResponse = {
    success,
    successWithPagination,
    error,
    validationError,
    notFound,
    badRequest,
    unauthorized,
    forbidden,
    conflict,
    internalError,
};