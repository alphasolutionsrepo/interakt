// src/shared/api/public-route.ts

/**
 * Marks a route as public: called by the embedded widget or an API client, not by a
 * signed-in admin. Error responses from inside it leave out the hint and the provider
 * details (apiResponse.error checks isPublicRequest), so visitors never see which
 * service failed or how.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const publicRequest = new AsyncLocalStorage<true>();

export function publicRoute<A extends unknown[], R>(handler: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
    return (...args: A) => publicRequest.run(true, () => handler(...args));
}

export function isPublicRequest(): boolean {
    return publicRequest.getStore() === true;
}
