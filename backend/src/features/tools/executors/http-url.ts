// src/features/tools/executors/http-url.ts

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
export const FIXED_HOST_MESSAGE = 'Use a full URL with a fixed host: write the host and a "/" before any {{input.field}}, which fills the path and query';

/** Whether a tool's URL keeps its host fixed, with {{input.field}} only after the host and its "/". */
export function hasFixedHost(baseUrl: string): boolean {
  return fixedOrigin(baseUrl) !== null;
}

/**
 * Whether the URL's path has a "." or ".." segment, which URL parsing removes along with the
 * segment before it ("%2e" counts as a dot).
 */
function hasDotSegment(url: string): boolean {
  const path = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '').split(/[?#]/)[0];
  return path.split('/').some((segment) => /^(\.|%2e){1,2}$/i.test(segment));
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
  if (hasDotSegment(filled) && !hasDotSegment(baseUrl.replace(INPUT_PATTERN, 'a'))) return { problem: 'path' };
  return originOf(filled) === origin ? { url: filled } : { problem: 'host' };
}
