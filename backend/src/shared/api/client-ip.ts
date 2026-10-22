// src/shared/api/client-ip.ts

/**
 * The address a request comes from, for per-client rate limits and analytics.
 *
 * Each proxy adds the address it received the request from to the end of
 * X-Forwarded-For, after anything the client sent itself. So the client is the entry
 * TRUSTED_PROXY_HOPS places from the end: 1 (the default) for one proxy in front of
 * Interakt, such as the hosting platform's; 2 with a CDN in front of that. Entries
 * further left were written by the client and are never used.
 */

import type { NextRequest } from 'next/server';

import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('client-ip');

const DEFAULT_HOPS = 1;
let warnedAbout: string | undefined;

function trustedHops(): number {
  const setting = process.env.TRUSTED_PROXY_HOPS?.trim();
  if (!setting) return DEFAULT_HOPS;
  const hops = Number(setting);
  if (Number.isInteger(hops) && hops >= 1) return hops;
  if (warnedAbout !== setting) {
    warnedAbout = setting;
    logger.warn('TRUSTED_PROXY_HOPS must be a whole number from 1; using 1', { setting });
  }
  return DEFAULT_HOPS;
}

export function clientIp(request: Pick<NextRequest, 'headers'>): string {
  const forwarded = (request.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (forwarded.length > 0) {
    // Fewer entries than proxies: the request reached us through fewer hops than set
    return forwarded[Math.max(0, forwarded.length - trustedHops())];
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}
