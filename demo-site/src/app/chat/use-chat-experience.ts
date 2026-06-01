'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatExperienceMessage, ChatSSEEvent } from './chat.types';

// ============================================================================
// Widget Config Hook
// ============================================================================

export interface WidgetConfig {
  name: string;
  greeting?: string;
  description?: string;
  suggestedQuestions?: string[];
  placeholder?: string;
  theme?: string;
  showBranding?: boolean;
}

/**
 * Fetches the widget config for an AI Experience from the backend.
 * Called once on mount when accessToken is available.
 */
export function useWidgetConfig({
  accessToken,
  apiUrl = 'http://localhost:3000',
}: {
  accessToken: string;
  apiUrl?: string;
}): { config: WidgetConfig | null; isLoading: boolean } {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setConfig(null);
      fetchedRef.current = null;
      return;
    }

    // Token changed — clear stale config immediately to prevent flash
    if (fetchedRef.current !== accessToken) {
      setConfig(null);
    }

    // Build a cache key from both token and URL so config refreshes when either changes
    const cacheKey = `${apiUrl}|${accessToken}`;
    if (fetchedRef.current === cacheKey) return;
    fetchedRef.current = cacheKey;

    setIsLoading(true);
    const baseUrl = apiUrl.replace(/\/+$/, '');

    fetch(`${baseUrl}/api/v1/ai-experiences/widget-config`, {
      headers: { 'X-Access-Token': accessToken },
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) {
          setConfig(null);
          return;
        }
        const json = await res.json();
        if (json.success && json.data) {
          setConfig(json.data as WidgetConfig);
        } else {
          setConfig(null);
        }
      })
      .catch(() => {
        setConfig(null);
      })
      .finally(() => setIsLoading(false));
  }, [accessToken, apiUrl]);

  return { config, isLoading };
}

// ============================================================================
// Chat Experience Hook
// ============================================================================

interface UseChatExperienceOptions {
  accessToken: string;
  apiUrl?: string;
}

interface UseChatExperienceReturn {
  messages: ChatExperienceMessage[];
  sendMessage: (text: string) => Promise<void>;
  isStreaming: boolean;
  error: string | null;
  clearSession: () => void;
  sessionId: string | null;
}

export function useChatExperience({
  accessToken,
  apiUrl = 'http://localhost:3000',
}: UseChatExperienceOptions): UseChatExperienceReturn {
  const [messages, setMessages] = useState<ChatExperienceMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Use a ref so the streaming handler always sees the latest sessionId
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = sessionId;

  // Abort controller for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  const clearSession = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setSessionId(null);
    sessionIdRef.current = null;
    setError(null);
    setIsStreaming(false);
  }, []);

  // Auto-clear session when access token or API URL changes (switching experience)
  const prevTokenRef = useRef(accessToken);
  useEffect(() => {
    if (prevTokenRef.current !== accessToken) {
      prevTokenRef.current = accessToken;
      clearSession();
    }
  }, [accessToken, clearSession]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !accessToken) return;

      setError(null);

      // Add user message
      const userMsg: ChatExperienceMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text.trim(),
        timestamp: new Date(),
      };

      // Prepare the assistant placeholder
      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatExperienceMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      // Helper to update the in-flight assistant message
      const updateAssistant = (
        updater: (msg: ChatExperienceMessage) => ChatExperienceMessage,
      ) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? updater(m) : m)),
        );
      };

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        const baseUrl = apiUrl.replace(/\/+$/, '');
        const url = `${baseUrl}/api/v1/ai-experiences/chat`;

        const body: Record<string, unknown> = { message: text.trim() };
        if (sessionIdRef.current) {
          body.sessionId = sessionIdRef.current;
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Access-Token': accessToken,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errBody = await response.text().catch(() => 'Unknown error');
          throw new Error(`HTTP ${response.status}: ${errBody}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        // Parse SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last potentially incomplete line
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw || raw === '[DONE]') continue;

            let event: ChatSSEEvent;
            try {
              event = JSON.parse(raw) as ChatSSEEvent;
            } catch {
              continue;
            }

            switch (event.type) {
              case 'step_start':
                updateAssistant((m) => ({
                  ...m,
                  pipelineStep: event.stepName,
                }));
                break;

              case 'step_complete':
                updateAssistant((m) => ({
                  ...m,
                  pipelineStep: undefined,
                }));
                break;

              case 'response_start':
                updateAssistant((m) => ({
                  ...m,
                  isGeneratingResponse: true,
                  pipelineStep: undefined,
                }));
                break;

              case 'content':
                updateAssistant((m) => ({
                  ...m,
                  content: m.content + event.text,
                  isGeneratingResponse: false,
                }));
                break;

              case 'preset':
                updateAssistant((m) => ({
                  ...m,
                  preset: event.preset,
                  presetPayload: event.data,
                }));
                break;

              case 'tool_call':
                updateAssistant((m) => ({
                  ...m,
                  toolCalls: [
                    ...(m.toolCalls ?? []),
                    { id: event.id, name: event.name, status: 'pending' as const },
                  ],
                }));
                break;

              case 'tool_result':
                updateAssistant((m) => ({
                  ...m,
                  toolCalls: (m.toolCalls ?? []).map((tc) =>
                    tc.id === event.id
                      ? {
                          ...tc,
                          status: event.success ? ('completed' as const) : ('failed' as const),
                          durationMs: event.durationMs,
                        }
                      : tc,
                  ),
                }));
                break;

              case 'action_step':
                updateAssistant((m) => ({
                  ...m,
                  actionSteps: [
                    ...(m.actionSteps ?? []),
                    {
                      toolSlug: event.toolSlug,
                      step: event.step,
                      durationMs: event.durationMs,
                      detail: event.detail,
                    },
                  ],
                }));
                break;

              case 'done':
                setSessionId(event.sessionId);
                sessionIdRef.current = event.sessionId;
                updateAssistant((m) => ({
                  ...m,
                  isStreaming: false,
                  isGeneratingResponse: false,
                  pipelineStep: undefined,
                }));
                break;

              case 'error':
                setError(event.message);
                updateAssistant((m) => ({
                  ...m,
                  isStreaming: false,
                  isGeneratingResponse: false,
                  pipelineStep: undefined,
                }));
                break;
            }
          }
        }

        // Ensure streaming is marked as finished
        updateAssistant((m) => ({
          ...m,
          isStreaming: false,
          isGeneratingResponse: false,
          pipelineStep: undefined,
        }));
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          updateAssistant((m) => ({
            ...m,
            isStreaming: false,
            isGeneratingResponse: false,
          }));
        } else {
          const message = err instanceof Error ? err.message : 'Something went wrong';
          setError(message);
          updateAssistant((m) => ({
            ...m,
            isStreaming: false,
            isGeneratingResponse: false,
            content: m.content || 'Failed to get a response.',
          }));
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [accessToken, apiUrl],
  );

  return { messages, sendMessage, isStreaming, error, clearSession, sessionId };
}
