// src/shared/api/public-route.ts

/**
 * Marks a route as public: called by the embedded widget or an API client, not by a
 * signed-in admin. Error responses from inside it leave out the hint and the provider
 * details and give a plain message on server failures (apiResponse.error checks
 * isPublicRequest), so visitors never see which service failed or how.
 *
 * A signed-in admin can call a public route too (the playgrounds test an experience
 * through it). Once the route knows that (markAdminCaller), errors are explained in full.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const publicRequest = new AsyncLocalStorage<{ public: boolean }>();

export function publicRoute<A extends unknown[], R>(handler: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
    return (...args: A) => publicRequest.run({ public: true }, () => handler(...args));
}

/** The caller of this public route is a signed-in admin: explain errors in full */
export function markAdminCaller(): void {
    const store = publicRequest.getStore();
    if (store) store.public = false;
}

export function isPublicRequest(): boolean {
    return publicRequest.getStore()?.public === true;
}
