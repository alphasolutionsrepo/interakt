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
 *                    with N from TRUSTED_PROXY_HOPS (default 1); `forwarded-for` alone, and a
 *                    setting that isn't understood, use that default too.
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

import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

import type { NextRequest } from 'next/server';

import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('client-ip');

type Source =
  // invalid: the setting that wasn't understood, so the default is used in its place:
  // CLIENT_IP_SOURCE, or TRUSTED_PROXY_HOPS where the proxies come from it
  | { kind: 'forwarded-for'; hops: number; invalid?: 'source' | 'hops' }
  | { kind: 'header'; name: string }
  | { kind: 'none' };

// HTTP header names: letters, digits and a few symbols
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  logger.warn(message);
}

/** Forget the warnings given, and the setting read (for tests). */
export function resetClientIpWarnings(): void {
  warned.clear();
  parsed = null;
}

/** The proxies from TRUSTED_PROXY_HOPS; invalid when it is set to something else than a whole number from 1 (1 is used then). */
function trustedHops(): { hops: number; invalid?: 'hops' } {
  const setting = process.env.TRUSTED_PROXY_HOPS?.trim();
  if (!setting) return { hops: 1 };
  const hops = Number(setting);
  if (Number.isInteger(hops) && hops >= 1) return { hops };
  // Settings are not logged: values read from the environment can be secrets elsewhere
  warnOnce(`hops:${setting}`, 'TRUSTED_PROXY_HOPS must be a whole number from 1; using 1');
  return { hops: 1, invalid: 'hops' };
}

function parseSource(setting: string | undefined): Source {
  if (!setting) return { kind: 'forwarded-for', ...trustedHops() };
  const [kind, ...rest] = setting.split(':');
  const value = rest.join(':').trim();
  switch (kind.trim().toLowerCase()) {
    case 'none':
      if (!value) return { kind: 'none' };
      break;
    case 'forwarded-for': {
      if (!value) return { kind: 'forwarded-for', ...trustedHops() };
      const hops = Number(value);
      if (Number.isInteger(hops) && hops >= 1) return { kind: 'forwarded-for', hops };
      break;
    }
    case 'header':
      if (HEADER_NAME.test(value)) return { kind: 'header', name: value };
      break;
  }
  const { hops } = trustedHops();
  warnOnce(`source:${setting}`, `CLIENT_IP_SOURCE must be none, forwarded-for:<proxies> or header:<name>; using forwarded-for:${hops} until it is fixed`);
  return { kind: 'forwarded-for', hops, invalid: 'source' };
}

// The settings are read once for each pair of values, not on every request
let parsed: { key: string; source: Source } | null = null;
function source(): Source {
  const setting = process.env.CLIENT_IP_SOURCE?.trim();
  const key = `${setting ?? ''}\u0000${process.env.TRUSTED_PROXY_HOPS ?? ''}`;
  if (parsed?.key !== key) parsed = { key, source: parseSource(setting) };
  return parsed.source;
}

// An address with the port some platforms add: 1.2.3.4:5678 or [2001:db8::1]:5678
const IPV4_WITH_PORT = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/;
const BRACKETED_IPV6 = /^\[([^\]]+)\](?::\d{1,5})?$/;

/** The eight 16-bit groups of an IPv6 address that isIP has accepted (zone id already removed). */
function groupsOf(address: string): number[] {
  let text = address;
  // A dotted IPv4 tail (::ffff:1.2.3.4) is the last two groups
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (tail) {
    const [a, b, c, d] = tail.slice(1).map(Number);
    text = `${text.slice(0, tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, rest] = text.split('::');
  const first = head ? head.split(':') : [];
  const last = rest ? rest.split(':') : [];
  const fill = text.includes('::') ? 8 - first.length - last.length : 0;
  return [...first, ...Array<string>(fill).fill('0'), ...last].map((group) => parseInt(group, 16));
}

/**
 * One written form for an address, so the same client is never counted as two: IPv4-mapped
 * (::ffff:1.2.3.4) IPv6 becomes the IPv4 address, and other IPv6 is lowercase with its longest
 * run of zero groups as `::`. A zone id (fe80::1%eth0) is dropped: it names an interface on the sender's own machine, not part of the address.
 * IPv4-compatible IPv6 (::1.2.3.4) is deprecated (RFC 4291 section 2.5.5.1) and stays IPv6, so a
 * real address such as ::1:2 is not read as 0.1.0.2.
 */
function normalised(address: string): string {
  const family = isIP(address);
  if (family === 4) return address;
  const groups = groupsOf(address.split('%')[0]);
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (mapped) return `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`;
  let best = { start: -1, length: 1 };
  for (let i = 0; i < 8; i++) {
    let length = 0;
    while (i + length < 8 && groups[i + length] === 0) length++;
    if (length > best.length) best = { start: i, length };
    i += Math.max(length - 1, 0);
  }
  const hex = groups.map((group) => group.toString(16));
  if (best.start < 0) return hex.join(':');
  return `${hex.slice(0, best.start).join(':')}::${hex.slice(best.start + best.length).join(':')}`;
}

/** The IP address in an entry, without a port, in one written form; null for anything else. */
function ipOrNull(value: string | undefined): string | null {
  const entry = value?.trim();
  if (!entry) return null;
  if (isIP(entry)) return normalised(entry);
  const v4 = IPV4_WITH_PORT.exec(entry)?.[1];
  if (v4 && isIP(v4) === 4) return v4;
  const v6 = BRACKETED_IPV6.exec(entry)?.[1];
  if (v6 && isIP(v6) === 6) return normalised(v6);
  return null;
}

export function clientIp(request: Pick<NextRequest, 'headers'>): string | null {
  const from = source();
  if (from.kind === 'none') return seen(null, 'none');
  if (from.kind === 'header') {
    const value = request.headers.get(from.name);
    if (value === null) {
      warnOnce('missing-header', 'A request arrived without the header named in CLIENT_IP_SOURCE; check that the edge sets it and that traffic cannot skip the edge');
      return seen(null, 'missing-header');
    }
    const address = ipOrNull(value);
    if (!address) warnOnce('not-an-address', 'The header named in CLIENT_IP_SOURCE held something that is not an IP address; check what the edge puts in it');
    return seen(address, 'not-an-address');
  }

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
  const address = ipOrNull(forwarded[forwarded.length - from.hops]);
  if (!address) warnOnce('not-an-address', 'The X-Forwarded-For entry CLIENT_IP_SOURCE points to is not an IP address; check how many proxies there are in front');
  return seen(address, 'not-an-address');
}

// ============================================================================
// SETUP STATUS (shown to admins on Health and the home page)
// ============================================================================

/** What requests showed about the setup: too few X-Forwarded-For entries, the header missing, no IP where one should be, or no source at all (none) */
type SeenProblem = 'short-list' | 'missing-header' | 'not-an-address' | 'none';

/**
 * What requests showed is judged over this last stretch of time, so a fixed setup clears itself.
 * A bucket counts while its start is inside the window, so a request is counted for between
 * WINDOW_MS - BUCKET_MS and WINDOW_MS after it arrived: never more than an hour, never less than 59 minutes.
 */
const WINDOW_MS = 60 * 60_000;
const BUCKET_MS = 60_000;
/** Requests without a trusted address must be at least this many, and this share, to count as a problem */
const MIN_PROBLEM_REQUESTS = 5;
const MIN_PROBLEM_SHARE = 0.1;

interface Bucket { start: number; trusted: number; untrusted: number }
interface SeenState { buckets: Bucket[]; lastProblem: { kind: SeenProblem; at: number } | null }

// Kept on globalThis: Next.js bundles the scheduled jobs apart from the routes, and each bundle
// gets its own copy of this module, so a module-level value would not be seen by the health job.
const STATE_KEY = Symbol.for('interakt.client-address-setup');
function state(): SeenState {
  const holder = globalThis as unknown as Record<symbol, SeenState | undefined>;
  return (holder[STATE_KEY] ??= { buckets: [], lastProblem: null });
}

function seen(address: string | null, problem: SeenProblem): string | null {
  const now = Date.now();
  const { buckets } = state();
  const start = now - (now % BUCKET_MS);
  let bucket = buckets[buckets.length - 1];
  if (!bucket || bucket.start !== start) {
    bucket = { start, trusted: 0, untrusted: 0 };
    buckets.push(bucket);
    while (buckets.length > 0 && buckets[0].start <= now - WINDOW_MS) buckets.shift();
  }
  if (address) {
    bucket.trusted++;
  } else {
    bucket.untrusted++;
    state().lastProblem = { kind: problem, at: now };
  }
  return address;
}

export interface ClientAddressSetup {
  /** What is in use, e.g. forwarded-for:1 (the default, when the setting isn't understood; the setting itself is not shown) */
  source: string;
  /** The proxies counted back when reading X-Forwarded-For */
  hops?: number;
  /** For an invalid-setting problem, which setting: CLIENT_IP_SOURCE or TRUSTED_PROXY_HOPS */
  invalid?: 'source' | 'hops';
  /** What is wrong, if anything: a setting, or what requests in the last hour showed */
  problem: null | 'invalid-setting' | SeenProblem;
  /** Requests in the last hour that needed an address, with and without a trusted one */
  trustedRequests: number;
  untrustedRequests: number;
  /** When a request last arrived without a trusted address */
  problemSeenAt?: string;
}

/**
 * How this server reads client addresses, and whether requests show it is set up right: a
 * problem when, in the last hour, at least 5 requests and 10% of those that needed an address
 * had no trusted one (a stray request that went around the proxy doesn't count).
 */
export function clientAddressSetup(now: number = Date.now()): ClientAddressSetup {
  const from = source();
  const { buckets, lastProblem } = state();
  let trusted = 0;
  let untrusted = 0;
  for (const bucket of buckets) {
    if (bucket.start > now - WINDOW_MS) {
      trusted += bucket.trusted;
      untrusted += bucket.untrusted;
    }
  }
  const base = {
    trustedRequests: trusted,
    untrustedRequests: untrusted,
    ...(lastProblem && untrusted > 0 ? { problemSeenAt: new Date(lastProblem.at).toISOString() } : {}),
  };
  if (from.kind === 'none') return { ...base, source: 'none', problem: 'none' };
  const described = from.kind === 'header' ? `header:${from.name}` : `forwarded-for:${from.hops}`;
  const hops = from.kind === 'forwarded-for' ? { hops: from.hops } : {};
  if (from.kind === 'forwarded-for' && from.invalid) return { ...base, ...hops, source: described, problem: 'invalid-setting', invalid: from.invalid };
  const problem = lastProblem && untrusted >= MIN_PROBLEM_REQUESTS && untrusted >= MIN_PROBLEM_SHARE * (trusted + untrusted)
    ? lastProblem.kind
    : null;
  return { ...base, ...hops, source: described, problem };
}

/** Forget the requests seen (for tests). */
export function resetClientAddressSetup(): void {
  const current = state();
  current.buckets = [];
  current.lastProblem = null;
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

/**
 * One person can hold a whole IPv6 prefix and use any address in it, so IPv6 clients are counted
 * per /56, the size express-rate-limit uses by default (ipv6Subnet). IPv4 is counted per address.
 */
const IPV6_PREFIX_BITS = 56;

function countedAs(address: string): string {
  if (!address.includes(':')) return address;
  const groups = groupsOf(address);
  const kept = groups.slice(0, 4).map((group, index) => {
    const bits = Math.max(0, Math.min(16, IPV6_PREFIX_BITS - index * 16));
    return group & ((0xffff << (16 - bits)) & 0xffff);
  });
  return `${normalised(`${kept.map((group) => group.toString(16)).join(':')}::`)}/${IPV6_PREFIX_BITS}`;
}

export function clientKey(request: Pick<NextRequest, 'headers'>): ClientKey {
  const address = clientIp(request);
  return address ? { key: countedAs(address), shared: false } : { key: 'no-trusted-address', shared: true };
}

/** The limit a key is held to: the per-client limit, or SHARED_LIMIT_FACTOR times it when shared. */
export function limitFor({ shared }: ClientKey, perClient: number): number {
  return shared ? perClient * SHARED_LIMIT_FACTOR : perClient;
}

// Random per process: a label can't be turned back into an address, or compared across restarts
const LABEL_SECRET = randomBytes(32);

/**
 * A short label for a client, for logs: the same client gets the same label within a process run,
 * and the address can't be read from it. A shared key has no address, so its name is used as is.
 */
export function clientLabel({ key, shared }: ClientKey): string {
  if (shared) return key;
  return createHmac('sha256', LABEL_SECRET).update(key).digest('hex').slice(0, 12);
}
