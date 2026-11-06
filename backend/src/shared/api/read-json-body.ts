// src/shared/api/read-json-body.ts

import { AppError } from '@/shared/errors/app-error';

/**
 * A request's JSON body. A body that isn't JSON is the caller's mistake, refused as 400
 * "Invalid JSON body" (answered and logged as a warning by apiResponse.error), not a
 * server failure.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
    try {
        return await request.json();
    } catch (error) {
        throw new AppError('Invalid JSON body', { code: 'INVALID_JSON', status: 400, cause: error });
    }
}
