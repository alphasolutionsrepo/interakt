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
 * The URL with input filled in, each value encoded as one URL part. Null when input would
 * choose the host: the URL reaches the same server whatever the input.
 */
export function resolveUrlTemplate(baseUrl: string, input: Record<string, unknown>): string | null {
  const origin = fixedOrigin(baseUrl);
  if (!origin) return null;
  const filled = baseUrl.replace(INPUT_PATTERN, (_, field: string) => {
    const v = input[field];
    return encodeURIComponent(v != null ? String(v) : '');
  });
  return originOf(filled) === origin ? filled : null;
}
