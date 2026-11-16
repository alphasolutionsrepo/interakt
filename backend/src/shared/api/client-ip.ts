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
 * Answers null when there is no trusted address (missing, fewer entries than proxies, not
 * an IP address, or `none`); callers then leave the address out rather than share one value.
 */

import { isIP } from 'node:net';

import type { NextRequest } from 'next/server';

import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('client-ip');

type Source = { kind: 'forwarded-for'; hops: number } | { kind: 'header'; name: string } | { kind: 'none' };

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
  return { kind: 'none' };
}

function ipOrNull(value: string | undefined): string | null {
  const address = value?.trim();
  return address && isIP(address) ? address : null;
}

export function clientIp(request: Pick<NextRequest, 'headers'>): string | null {
  const from = source();
  if (from.kind === 'none') return null;
  if (from.kind === 'header') return ipOrNull(request.headers.get(from.name) ?? undefined);

  // All X-Forwarded-For headers of the request read as one list (Headers joins them)
  const forwarded = (request.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (forwarded.length === 0) {
    warnOnce('no-forwarded-for', 'A request arrived without X-Forwarded-For although CLIENT_IP_SOURCE expects a proxy in front; if nothing is in front, set CLIENT_IP_SOURCE=none');
    return null;
  }
  // Fewer entries than proxies: a proxy was skipped, so the entry there isn't one we added
  if (forwarded.length < from.hops) return null;
  return ipOrNull(forwarded[forwarded.length - from.hops]);
}
