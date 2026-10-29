// src/shared/api/response.ts

/**
 * Standardized API Response Builder
 * Provides consistent response format across all API endpoints
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { isPublicRequest } from './public-route';
import { currentRequestId } from './request-id';

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

function errorResponse(body: ErrorBody, status: number, requestId: string = currentRequestId()): NextResponse<APIErrorResponse> {
    // Visitors of the widget and API clients don't get to see which service failed or how
    const internal = isPublicRequest() && status >= 500;
    return NextResponse.json(
        {
            success: false as const,
            code: body.code,
            message: body.message,
            error: body.message,
            ...(body.hint && !internal && { hint: body.hint }),
            ...(body.fields?.length && { fields: body.fields }),
            ...(body.details !== undefined && !internal && { details: body.details }),
            requestId,
        },
        { status }
    );
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
    const requestId = currentRequestId();

    if (typeof err === 'string') {
        if (status >= 500) logger.error(err, undefined, { requestId });
        return errorResponse({ code: codeForStatus(status), message: err }, status, requestId);
    }

    const appError = toAppError(err);
    const recognised = appError.code !== 'INTERNAL';
    const finalStatus = recognised ? appError.status : status;
    const message = recognised
        ? appError.message
        // The caller chose a 4xx for this error: its message is meant for the user
        : finalStatus < 500 && err instanceof Error ? err.message : INTERNAL_MESSAGE;

    if (finalStatus >= 500) {
        logger.error('Request failed', err instanceof Error ? err : new Error(String(err)), {
            requestId,
            code: appError.code,
            ...(appError.details !== undefined && { details: appError.details }),
        });
    } else {
        logger.warn('Request rejected', { requestId, code: appError.code, message });
    }

    return errorResponse(
        {
            code: recognised ? appError.code : codeForStatus(finalStatus),
            message,
            hint: appError.hint,
            fields: appError.fields,
            details: appError.details,
        },
        finalStatus,
        requestId
    );
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
    return errorResponse({ code: 'INTERNAL', message }, 500);
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