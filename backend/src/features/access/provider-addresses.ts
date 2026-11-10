// src/features/access/provider-addresses.ts

/**
 * An AI provider's address can name an internal host and carry a password, so only roles that
 * view providers get it. Everyone else who reads providers (to pick a model, or on the health
 * page) gets them without it.
 */

import 'server-only';

import { NextResponse } from 'next/server';

import { AI_MODEL_READERS } from './permissions';
import { withoutFields } from './redact';
import { checkAccess, SIGNED_IN, withPermission } from './route-guard';
import { can } from './user-access';

/** The fields that carry a provider's address (health adds the URL it tested). */
const ADDRESS_FIELDS: ReadonlySet<string> = new Set(['baseUrl', 'endpointTested']);

export function withoutProviderAddresses<T>(value: T): T {
  return withoutFields(value, ADDRESS_FIELDS);
}

/** `value` as the caller may see it: without provider addresses unless they hold ai-providers:view. */
export async function providerAddressesFor<T>(value: T): Promise<T> {
  const { access } = await checkAccess(SIGNED_IN);
  return access && can(access, 'ai-providers:view') ? value : withoutProviderAddresses(value);
}

export const HIDES_PROVIDER_ADDRESSES = Symbol.for('interakt.hidesProviderAddresses');

/**
 * The gate for routes that list providers or models for anyone who picks a model
 * (AI_MODEL_READERS): the JSON answer leaves out provider addresses for roles that can't view
 * providers. Every route gated by AI_MODEL_READERS uses this (routes.access.test).
 */
export function forModelReaders<A extends unknown[]>(handler: (...args: A) => Response | Promise<Response>) {
  const route = withPermission(AI_MODEL_READERS, async (...args: A): Promise<Response> => {
    const res = await handler(...args);
    const { access } = await checkAccess(SIGNED_IN);
    // A role that views providers gets the answer as it is
    if ((access && can(access, 'ai-providers:view')) || !res.headers.get('content-type')?.includes('application/json')) return res;
    const body = withoutProviderAddresses(await res.json());
    const headers = new Headers(res.headers);
    headers.delete('content-length');
    return NextResponse.json(body, { status: res.status, headers });
  });
  Object.defineProperty(route, HIDES_PROVIDER_ADDRESSES, { value: true });
  return route;
}
