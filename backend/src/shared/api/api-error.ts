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

/**
 * Read an API response: the data on success ({ data } unwrapped, or the body as it is),
 * an ApiError thrown on failure. The status is checked before the body is read, so an
 * error page from a gateway or proxy (HTML) still gives a readable error. A success
 * that isn't JSON comes back as text.
 */
export async function handleApiResponse<T>(response: Response, fallback?: string): Promise<T> {
    if (!response.ok) throw await toApiError(response, fallback);
    const text = await response.text();
    if (!text) return undefined as T;
    let body: unknown;
    try {
        body = JSON.parse(text);
    } catch {
        return text as T;
    }
    // { success, data }: the data, even when it is null
    if (body !== null && typeof body === 'object' && 'data' in body) return (body as { data: T }).data;
    return body as T;
}
