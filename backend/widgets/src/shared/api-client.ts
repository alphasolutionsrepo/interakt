import type {
  ChatStreamEvent,
  SearchResponse,
  WidgetConfigResponse,
} from './types';

/** The code of the 404 an installation sends for an area that is switched off */
export const TURNED_OFF_CODE = 'FEATURE_OFF';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** The server's own message and code for a failed answer, when it sent them */
async function readRefusal(response: Response): Promise<{ error?: string; code?: string }> {
  try {
    const body = await response.json();
    return { error: typeof body?.error === 'string' ? body.error : undefined, code: typeof body?.code === 'string' ? body.code : undefined };
  } catch {
    return {};
  }
}

function defaultBaseUrl(): string {
  if (typeof document === 'undefined') return '';
  const script = document.currentScript as HTMLScriptElement | null;
  if (script?.src) {
    try {
      return new URL(script.src).origin;
    } catch {
      /* fall through */
    }
  }
  return window.location.origin;
}

const SCRIPT_ORIGIN = defaultBaseUrl();

export function resolveApiBase(override?: string): string {
  // Linear trailing-slash trim — avoids the polynomial backtracking of /\/+$/.
  const base = override ?? SCRIPT_ORIGIN;
  let end = base.length;
  while (end > 0 && base.charCodeAt(end - 1) === 47 /* '/' */) end--;
  return base.slice(0, end);
}

/** Marks a request from the admin's Widget playground; the server also needs the admin's login. */
export const TEST_MARKER_HEADER = 'X-Interakt-Test';

function buildHeaders(accessToken: string, testMode = false): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Access-Token': accessToken,
    ...(testMode && { [TEST_MARKER_HEADER]: '1' }),
  };
}

export async function fetchWidgetConfig(
  apiBaseUrl: string,
  accessToken: string,
): Promise<WidgetConfigResponse> {
  const response = await fetch(
    `${apiBaseUrl}/api/v1/ai-experiences/widget-config`,
    {
      method: 'GET',
      headers: buildHeaders(accessToken),
      credentials: 'omit',
    },
  );

  if (!response.ok) {
    const { code } = await readRefusal(response);
    throw new ApiError(
      `Failed to fetch widget config (HTTP ${response.status})`,
      response.status,
      code,
    );
  }
  const body = await response.json();
  return (body?.data ?? {}) as WidgetConfigResponse;
}

export interface SearchParams {
  query: string;
  page?: number;
  pageSize?: number;
  /** UUID of a specific index to search. Omit to search all indexes on the experience. */
  indexId?: string;
}

/**
 * Token-only public search endpoint. The backend resolves the search
 * experience purely from the X-Access-Token header — no slug required.
 */
export async function performSearch(
  apiBaseUrl: string,
  accessToken: string,
  params: SearchParams,
  testMode = false,
): Promise<SearchResponse> {
  const response = await fetch(`${apiBaseUrl}/api/v1/search`, {
    method: 'POST',
    headers: buildHeaders(accessToken, testMode),
    // Same origin only: in the admin's Widget playground the login goes with the test marker,
    // so the server records a test; a visitor on another site sends no cookie.
    credentials: 'same-origin',
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    // A switched-off area says so; any other failure keeps the plain message
    const { error, code } = await readRefusal(response);
    throw new ApiError(code === TURNED_OFF_CODE && error ? error : `Search failed (HTTP ${response.status})`, response.status, code);
  }
  const body = await response.json();
  // Public API wraps the payload as { success, data }.
  return (body?.data ?? body) as SearchResponse;
}

export async function performAutocomplete(
  apiBaseUrl: string,
  accessToken: string,
  query: string,
): Promise<string[]> {
  const response = await fetch(`${apiBaseUrl}/api/v1/autocomplete`, {
    method: 'POST',
    headers: buildHeaders(accessToken),
    credentials: 'omit',
    body: JSON.stringify({ query }),
  });
  if (!response.ok) return [];
  const body = await response.json();
  const suggestions = body?.data?.suggestions ?? body?.suggestions ?? [];
  if (!Array.isArray(suggestions)) return [];
  return suggestions
    .map((s: unknown) =>
      typeof s === 'string' ? s : ((s as { text?: string })?.text ?? ''),
    )
    .filter((text: string) => text.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Summarize — streaming AI summary over the current page of search results.
// The backend resolves the search experience from the access token; the
// summarize feature is opt-in per experience (aiConfig.summary.enabled) and
// returns 403 when disabled, which we swallow silently upstream.
// ─────────────────────────────────────────────────────────────────────────────

export interface SummarizeParams {
  query: string;
  results: Array<{
    id: string;
    index: { id: string; name: string };
    fields: Record<string, unknown>;
  }>;
  totalResults: number;
  instruction?: string;
}

/** Yields summary text tokens as they arrive. Throws ApiError on non-OK response. */
export async function* streamSummarize(
  apiBaseUrl: string,
  accessToken: string,
  params: SummarizeParams,
  signal?: AbortSignal,
  testMode = false,
): AsyncGenerator<string, void, void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/summarize`, {
    method: 'POST',
    headers: {
      ...buildHeaders(accessToken, testMode),
      Accept: 'text/event-stream',
    },
    // Same origin only: in the admin's Widget playground the login goes with the test marker,
    // so the server records a test; a visitor on another site sends no cookie.
    credentials: 'same-origin',
    body: JSON.stringify(params),
    signal,
  });

  if (!response.ok) {
    throw new ApiError(`Summarize failed (HTTP ${response.status})`, response.status);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new ApiError('No response body for summarize stream', 500);

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const event = JSON.parse(data) as { type?: string; text?: string };
            if (event.type === 'content' && typeof event.text === 'string') {
              yield event.text;
            }
          } catch {
            /* ignore malformed event */
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

export interface ChatStreamOptions {
  apiBaseUrl: string;
  accessToken: string;
  message: string;
  sessionId?: string;
  signal?: AbortSignal;
  /** The admin's Widget playground (see BaseConfig.testMode) */
  testMode?: boolean;
}

/**
 * SSE reader for POST /api/v1/ai-experiences/chat — the token-only public
 * chat endpoint. The backend resolves the AI experience from the access
 * token; no slug is needed on the client.
 *
 * Yields parsed events as they arrive. Format: `data: <json>\n\n` with
 * `[DONE]` sentinel.
 */
export async function* streamChat(
  options: ChatStreamOptions,
): AsyncGenerator<ChatStreamEvent, void, void> {
  const { apiBaseUrl, accessToken, message, sessionId, signal, testMode } = options;

  const response = await fetch(`${apiBaseUrl}/api/v1/ai-experiences/chat`, {
    method: 'POST',
    headers: {
      ...buildHeaders(accessToken, testMode),
      Accept: 'text/event-stream',
    },
    // Same origin only: in the admin's Widget playground the login goes with the test marker,
    // so the server records a test; a visitor on another site sends no cookie.
    credentials: 'same-origin',
    body: JSON.stringify({ message, sessionId }),
    signal,
  });

  if (!response.ok) {
    const { error, code } = await readRefusal(response);
    throw new ApiError(error ?? `Chat request failed (HTTP ${response.status})`, response.status, code);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new ApiError('No response body for chat stream', 500);

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const lines = part.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          if (data === '[DONE]') return;
          try {
            yield JSON.parse(data) as ChatStreamEvent;
          } catch {
            /* ignore malformed event */
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}
