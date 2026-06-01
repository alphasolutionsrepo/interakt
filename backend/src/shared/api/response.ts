// src/shared/api/response.ts

/**
 * Standardized API Response Builder
 * Provides consistent response format across all API endpoints
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

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

export interface APIErrorResponse {
    success: false;
    error: string;
    details?: any;
    code?: string;
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
 * Error response
 */
function error(err: Error | string, status: number = 500): NextResponse<APIErrorResponse> {
    const rawMessage = err instanceof Error ? err.message : err;

    // Never leak internal details (SQL, stack traces, etc.) to clients for 5xx errors
    const clientMessage = status >= 500
        ? 'Something went wrong. Please try again or contact support if the issue persists.'
        : rawMessage;

    if (status >= 500) {
        const logErr = err instanceof Error ? err : new Error(rawMessage);
        console.error('[api] Internal error:', logErr.message, logErr.stack);
    }

    return NextResponse.json(
        {
            success: false,
            error: clientMessage,
            code: status >= 500 ? 'INTERNAL_ERROR' : 'ERROR',
        },
        { status }
    );
}

/**
 * Validation error (Zod)
 */
function validationError(zodError: ZodError): NextResponse<APIErrorResponse> {
    return NextResponse.json(
        {
            success: false,
            error: 'Validation failed',
            details: zodError.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message,
            })),
            code: 'VALIDATION_ERROR',
        },
        { status: 400 }
    );
}

/**
 * Not found error
 */
function notFound(message: string = 'Resource not found'): NextResponse<APIErrorResponse> {
    return NextResponse.json(
        {
            success: false,
            error: message,
            code: 'NOT_FOUND',
        },
        { status: 404 }
    );
}

/**
 * Bad request error
 */
function badRequest(message: string): NextResponse<APIErrorResponse> {
    return NextResponse.json(
        {
            success: false,
            error: message,
            code: 'BAD_REQUEST',
        },
        { status: 400 }
    );
}

/**
 * Unauthorized error
 */
function unauthorized(message: string = 'Unauthorized'): NextResponse<APIErrorResponse> {
    return NextResponse.json(
        {
            success: false,
            error: message,
            code: 'UNAUTHORIZED',
        },
        { status: 401 }
    );
}

/**
 * Forbidden error
 */
function forbidden(message: string = 'Forbidden'): NextResponse<APIErrorResponse> {
    return NextResponse.json(
        {
            success: false,
            error: message,
            code: 'FORBIDDEN',
        },
        { status: 403 }
    );
}

/**
 * Conflict error (409)
 */
function conflict(message: string): NextResponse<APIErrorResponse> {
    return NextResponse.json(
        {
            success: false,
            error: message,
            code: 'CONFLICT',
        },
        { status: 409 }
    );
}

/**
 * Internal server error
 */
function internalError(message: string = 'Internal server error'): NextResponse<APIErrorResponse> {
    return NextResponse.json(
        {
            success: false,
            error: message,
            code: 'INTERNAL_ERROR',
        },
        { status: 500 }
    );
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