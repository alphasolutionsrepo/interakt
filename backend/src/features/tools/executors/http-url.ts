// src/features/tools/executors/http-url.ts

/** An HTTP tool's {{input.field}} placeholder, filled with what the AI passes for that field. */
export const INPUT_PATTERN = /\{\{input\.([a-zA-Z0-9_]+)\}\}/g;

function originOf(url: string): string | null {
  try { return new URL(url).origin; } catch { return null; }
}

/** The server a URL reaches whatever its input: null when input would choose the host. */
function fixedOrigin(baseUrl: string): string | null {
  const origin = originOf(baseUrl.replace(INPUT_PATTERN, 'a'));
  return origin && originOf(baseUrl.replace(INPUT_PATTERN, 'b')) === origin ? origin : null;
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
