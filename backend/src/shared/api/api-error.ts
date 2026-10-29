// src/shared/api/api-error.ts

/**
 * The client side of the API error shape (see APIErrorResponse in response.ts):
 * what failed, what to do, which form fields are wrong, the provider's details,
 * and the request id support uses to find the server log line.
 */

export interface ApiFieldError {
    field: string;
    message: string;
}

export interface ApiErrorBody {
    code?: string;
    message?: string;
    error?: string;
    hint?: string;
    fields?: ApiFieldError[];
    details?: unknown;
    requestId?: string;
}

export class ApiError extends Error {
    readonly status: number;
    readonly code?: string;
    readonly hint?: string;
    readonly fields?: ApiFieldError[];
    readonly details?: unknown;
    readonly requestId?: string;

    constructor(message: string, status: number, body: ApiErrorBody = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = body.code;
        this.hint = body.hint;
        this.fields = body.fields;
        this.details = body.details;
        this.requestId = body.requestId;
    }
}

/** The ApiError for a failed response, whatever the body holds */
export async function toApiError(response: Response, fallback: string = 'The request failed'): Promise<ApiError> {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    return apiErrorFrom(body, response.status, fallback);
}

/** The ApiError for an error body already read */
export function apiErrorFrom(body: ApiErrorBody | null | undefined, status: number, fallback: string = 'The request failed'): ApiError {
    const message = body?.message || body?.error || `${fallback} (${status})`;
    return new ApiError(message, status, body ?? {});
}

/** Read a JSON response: its data on success, an ApiError thrown on failure */
export async function handleApiResponse<T>(response: Response): Promise<T> {
    if (!response.ok) throw await toApiError(response);
    const data = await response.json();
    return data.data ?? data;
}
