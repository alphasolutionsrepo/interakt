// src/shared/api/client-ip.ts

/**
 * The address a request comes from, for per-client rate limits and analytics.
 *
 * A request's headers are written by whoever sends it, so only an address added by a proxy
 * we run can be trusted (MDN, X-Forwarded-For: "Security and privacy concerns"). Where that
 * address is depends on what is in front of Interakt, set with CLIENT_IP_SOURCE:
 *
 *   forwarded-for:N  N proxies in front, each adding the address it received the request
 *                    from to the end of X-Forwarded-For: the client is the entry N places
 *                    from the end. 1 for one proxy (a hosting platform's ingress, or one
 *                    nginx/Traefik), 2 with a CDN or gateway in front of that. The default,
 *                    with N from TRUSTED_PROXY_HOPS (default 1).
 *   header:<name>    An edge that puts the client's address alone in a header of its own,
 *                    such as X-Azure-SocketIP (Azure Front Door) or CF-Connecting-IP
 *                    (Cloudflare). Only safe when the app accepts traffic from that edge alone.
 *   none             Nothing in front: every header is the client's own, so there is no
 *                    trusted address and nothing is decided by address.
 *
 * clientIp answers null when there is no trusted address (missing, fewer entries than
 * proxies, not an IP address, or `none`). Rate limits use clientKey instead: requests without
 * a trusted address share one count at a higher limit, so a limit never switches off.
 */

import { isIP } from 'node:net';

import type { NextRequest } from 'next/server';

import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('client-ip');

type Source =
  | { kind: 'forwarded-for'; hops: number }
  | { kind: 'header'; name: string }
  | { kind: 'none'; invalid?: true };

// HTTP header names: letters, digits and a few symbols
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  logger.warn(message);
}

/** Forget the warnings given (for tests). */
export function resetClientIpWarnings(): void {
  warned.clear();
}

function trustedHops(): number {
  const setting = process.env.TRUSTED_PROXY_HOPS?.trim();
  if (!setting) return 1;
  const hops = Number(setting);
  if (Number.isInteger(hops) && hops >= 1) return hops;
  // Settings are not logged: values read from the environment can be secrets elsewhere
  warnOnce(`hops:${setting}`, 'TRUSTED_PROXY_HOPS must be a whole number from 1; using 1');
  return 1;
}

function source(): Source {
  const setting = process.env.CLIENT_IP_SOURCE?.trim();
  if (!setting) return { kind: 'forwarded-for', hops: trustedHops() };
  const [kind, ...rest] = setting.split(':');
  const value = rest.join(':').trim();
  switch (kind.trim().toLowerCase()) {
    case 'none':
      if (!value) return { kind: 'none' };
      break;
    case 'forwarded-for': {
      if (!value) return { kind: 'forwarded-for', hops: 1 };
      const hops = Number(value);
      if (Number.isInteger(hops) && hops >= 1) return { kind: 'forwarded-for', hops };
      break;
    }
    case 'header':
      if (HEADER_NAME.test(value)) return { kind: 'header', name: value };
      break;
  }
  warnOnce(`source:${setting}`, 'CLIENT_IP_SOURCE must be none, forwarded-for:<proxies> or header:<name>; no client address is trusted until it is fixed');
  return { kind: 'none', invalid: true };
}

// An address with the port some platforms add: 1.2.3.4:5678 or [2001:db8::1]:5678
const IPV4_WITH_PORT = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/;
const BRACKETED_IPV6 = /^\[([^\]]+)\](?::\d{1,5})?$/;

/** The IP address in an entry, without a port; null for anything else. */
function ipOrNull(value: string | undefined): string | null {
  const entry = value?.trim();
  if (!entry) return null;
  if (isIP(entry)) return entry;
  const v4 = IPV4_WITH_PORT.exec(entry)?.[1];
  if (v4 && isIP(v4) === 4) return v4;
  const v6 = BRACKETED_IPV6.exec(entry)?.[1];
  if (v6 && isIP(v6) === 6) return v6;
  return null;
}

export function clientIp(request: Pick<NextRequest, 'headers'>): string | null {
  const from = source();
  if (from.kind === 'none') return null;
  if (from.kind === 'header') return seen(ipOrNull(request.headers.get(from.name) ?? undefined), 'not-an-address');

  // All X-Forwarded-For headers of the request read as one list (Headers joins them)
  const forwarded = (request.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  // Fewer entries than proxies (none at all included): a proxy was skipped or isn't there, so
  // the entry there isn't one we added. Next.js fills in an empty header with the connection's
  // address, so a request reaching it directly usually has one entry.
  if (forwarded.length < from.hops) {
    warnOnce('short-forwarded-for', 'A request arrived with fewer X-Forwarded-For entries than the proxies CLIENT_IP_SOURCE expects in front; check how many proxies there are');
    return seen(null, 'short-list');
  }
  return seen(ipOrNull(forwarded[forwarded.length - from.hops]), 'not-an-address');
}

// ============================================================================
// SETUP STATUS (shown to admins on Health and the home page)
// ============================================================================

/** What requests showed about the setup: too few X-Forwarded-For entries, or no IP where one should be */
type SeenProblem = 'short-list' | 'not-an-address';

/** A problem seen this long ago or longer no longer counts */
const PROBLEM_WINDOW_MS = 24 * 60 * 60_000;

const counts = { trusted: 0, untrusted: 0 };
let lastProblem: { kind: SeenProblem; at: number } | null = null;

function seen(address: string | null, problem: SeenProblem): string | null {
  if (address) {
    counts.trusted++;
  } else {
    counts.untrusted++;
    lastProblem = { kind: problem, at: Date.now() };
  }
  return address;
}

export interface ClientAddressSetup {
  /** The setting in use, e.g. forwarded-for:1 (the setting itself when it isn't valid is not shown) */
  source: string;
  /** What is wrong, if anything: a setting, or what requests in the last day showed */
  problem: null | 'none' | 'invalid-setting' | SeenProblem;
  /** Requests with and without a trusted address since this server started */
  trustedRequests: number;
  untrustedRequests: number;
  /** When requests last showed the problem */
  problemSeenAt?: string;
}

/** How this server reads client addresses, and whether requests show it is set up right. */
export function clientAddressSetup(now: number = Date.now()): ClientAddressSetup {
  const from = source();
  const base = { trustedRequests: counts.trusted, untrustedRequests: counts.untrusted };
  if (from.kind === 'none') return { ...base, source: 'none', problem: from.invalid ? 'invalid-setting' : 'none' };
  const described = from.kind === 'header' ? `header:${from.name}` : `forwarded-for:${from.hops}`;
  if (lastProblem && now - lastProblem.at < PROBLEM_WINDOW_MS) {
    return { ...base, source: described, problem: lastProblem.kind, problemSeenAt: new Date(lastProblem.at).toISOString() };
  }
  return { ...base, source: described, problem: null };
}

/** Forget the requests seen (for tests). */
export function resetClientAddressSetup(): void {
  counts.trusted = 0;
  counts.untrusted = 0;
  lastProblem = null;
}

/**
 * Requests without a trusted address share one count, at this many times the per-client limit:
 * the limit still holds, and one caller can't use up the count for everyone at normal traffic.
 */
export const SHARED_LIMIT_FACTOR = 10;

/** Who a request is counted as by a per-client limit; `shared` when it has no trusted address. */
export interface ClientKey {
  key: string;
  shared: boolean;
}

export function clientKey(request: Pick<NextRequest, 'headers'>): ClientKey {
  const address = clientIp(request);
  return address ? { key: address, shared: false } : { key: 'no-trusted-address', shared: true };
}

/** The limit a key is held to: the per-client limit, or SHARED_LIMIT_FACTOR times it when shared. */
export function limitFor({ shared }: ClientKey, perClient: number): number {
  return shared ? perClient * SHARED_LIMIT_FACTOR : perClient;
}
