import type {
  SearchRequest,
  SearchResponse,
  AutocompleteRequest,
  AutocompleteResponse,
  SummarizeRequest,
  SummarizeEvent,
  ApiError,
} from './types';

// ============================================================================
// API CLIENT
// ============================================================================

export class SearchApiClient {
  constructor(
    private apiUrl: string,
    private accessToken: string
  ) {}

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Token': this.accessToken,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' })) as ApiError;
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const json = await response.json();
    return json.data ?? json;
  }

  // =========================================================================
  // SEARCH
  // =========================================================================

  async search(request: SearchRequest): Promise<SearchResponse> {
    return this.request<SearchResponse>('/api/v1/search', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // =========================================================================
  // AUTOCOMPLETE
  // =========================================================================

  async autocomplete(request: AutocompleteRequest): Promise<AutocompleteResponse> {
    return this.request<AutocompleteResponse>('/api/v1/autocomplete', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // =========================================================================
  // SUMMARIZE (Streaming)
  // =========================================================================

  async streamSummary(
    request: SummarizeRequest,
    onContent: (text: string) => void,
    onComplete: () => void,
    onError: (error: Error) => void,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/api/v1/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'X-Access-Token': this.accessToken,
        },
        body: JSON.stringify(request),
        signal,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Summary failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              onComplete();
              continue;
            }

            try {
              const parsed = JSON.parse(data) as SummarizeEvent;
              if (parsed.type === 'content') {
                onContent(parsed.text);
              } else if (parsed.type === 'error') {
                onError(new Error(parsed.error));
              } else if (parsed.type === 'done') {
                onComplete();
              }
            } catch {
              // Ignore partial JSON
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // User cancelled, not an error
      }
      onError(error instanceof Error ? error : new Error('Unknown error'));
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createApiClient(apiUrl: string, accessToken: string): SearchApiClient {
  return new SearchApiClient(apiUrl, accessToken);
}
