// src/features/tools/executors/http-url.ts

import { SECRET_TEMPLATE_PATTERN } from '@/features/secrets/secret-template';

/** An HTTP tool's {{input.field}} placeholder, filled with what the AI passes for that field. */
export const INPUT_PATTERN = /\{\{input\.([a-zA-Z0-9_]+)\}\}/g;

/** Everything before the path: scheme, any login written before "@", host and port. */
function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username}:${u.password}@${u.host}`;
  } catch { return null; }
}

/** The server a URL reaches, and how, whatever its input: null when input would choose them. */
function fixedOrigin(baseUrl: string): string | null {
  const origin = originOf(baseUrl.replace(INPUT_PATTERN, 'a'));
  return origin && originOf(baseUrl.replace(INPUT_PATTERN, 'b')) === origin ? origin : null;
}

/** What to change when a tool's URL lets input choose the host. */
export const FIXED_HOST_MESSAGE = 'Use a full URL (like https://api.example.com/orders) with a fixed host: write the host and a "/" before any {{input.field}}, which fills the path and query';

/** What to change when a tool's URL isn't a full URL at all (no "https://" start). */
export const NOT_A_URL_MESSAGE = 'This is not a full URL. Use a full URL that starts with https://, like https://api.example.com/orders';

/** True when the text has no "scheme://" start and isn't a template standing in for one. */
function isNotFullUrl(baseUrl: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:\/\//i.test(baseUrl) && !baseUrl.startsWith('{{');
}

/** What to change in a tool's URL, or undefined when it is fine to save and run. */
export function urlProblemMessage(baseUrl: string): string | undefined {
  if (isNotFullUrl(baseUrl)) return NOT_A_URL_MESSAGE;
  return hasFixedHost(baseUrl) ? undefined : FIXED_HOST_MESSAGE;
}

/** Names of {{secret:name}} templates still in the text: the vault had no secret by that name. */
export function unresolvedSecretNames(text: string): string[] {
  return [...new Set([...text.matchAll(SECRET_TEMPLATE_PATTERN)].map((m) => m[1]))];
}

/**
 * Whether a tool's stored URL keeps its host fixed, with {{input.field}} only after the host and
 * its "/". A {{secret:name}} is the admin's own value, filled in before the call, so it counts
 * as written (as "secret").
 */
export function hasFixedHost(baseUrl: string): boolean {
  // A URL that starts with a secret has the secret's server: stand it in as a full address
  const written = baseUrl
    .replace(new RegExp(`^${SECRET_TEMPLATE_PATTERN.source}`), 'https://secret.invalid')
    .replace(SECRET_TEMPLATE_PATTERN, 'secret');
  return fixedOrigin(written) !== null;
}

/**
 * How many "." or ".." segments the URL's path has: URL parsing removes them, with the segment
 * before a "..". ("%2e" counts as a dot.)
 */
function dotSegments(url: string): number {
  const path = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '').split(/[?#]/)[0];
  return path.split('/').filter((segment) => /^(\.|%2e){1,2}$/i.test(segment)).length;
}

/**
 * The URL with input filled in, each value encoded as one URL part, or why it can't be:
 * 'host' when the URL lets input choose the host (the tool's URL is set up that way), 'path'
 * when an input value would step out of the admin's path with a "." or ".." segment. The URL
 * reaches the server and path the admin set, whatever the input.
 */
export function resolveUrlTemplate(
  baseUrl: string,
  input: Record<string, unknown>,
): { url: string } | { problem: 'host' | 'path' } {
  const origin = fixedOrigin(baseUrl);
  if (!origin) return { problem: 'host' };
  const filled = baseUrl.replace(INPUT_PATTERN, (_, field: string) => {
    const v = input[field];
    return encodeURIComponent(v != null ? String(v) : '');
  });
  // More dot segments than the admin wrote: an input value is one
  if (dotSegments(filled) > dotSegments(baseUrl.replace(INPUT_PATTERN, 'a'))) return { problem: 'path' };
  return originOf(filled) === origin ? { url: filled } : { problem: 'host' };
}
