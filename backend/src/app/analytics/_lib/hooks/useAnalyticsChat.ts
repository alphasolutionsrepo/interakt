// app/analytics/_lib/hooks/useAnalyticsChat.ts

'use client';

/**
 * The analytics chat conversation: sending a question, streaming the answer
 * (status, tool data, text) and the saved session it belongs to. Shared by the
 * full chat page and the Ask panel, so both behave the same.
 *
 * A conversation is scoped to the experience it started on. Switching
 * experience mid-conversation starts a new one; the old one stays in history.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAnalyticsContext } from '../AnalyticsContext';
import { resolvePeriod } from '../period';

// ============================================================================
// TYPES
// ============================================================================

export interface AnalyticsDataBlock {
  tool: string;
  dataType: string;
  data: unknown;
  /** The period the data covers, e.g. "Oct 13, 2026" */
  periodLabel?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolsUsed?: string[];
  error?: boolean;
  isStreaming?: boolean;
  analyticsData?: AnalyticsDataBlock[];
  suggestedFollowUps?: string[];
  dataStatus?: 'has_data' | 'no_data' | 'sparse_data' | 'anomaly';
  /** Figures in the answer that weren't found in the data it was based on */
  unverifiedFigures?: string[];
}

interface StreamChunk {
  type: 'status' | 'tool_start' | 'tool_result' | 'tool_data' | 'content' | 'done' | 'error' | 'response_metadata' | 'verification';
  message?: string;
  content?: string;
  done?: boolean;
  tool?: string;
  input?: Record<string, unknown>;
  success?: boolean;
  hasData?: boolean;
  dataType?: string;
  data?: unknown;
  sessionId?: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  toolsUsed?: string[];
  error?: string;
  // For response_metadata
  dataStatus?: 'has_data' | 'no_data' | 'sparse_data' | 'anomaly';
  timePeriod?: string;
  suggestedFollowUps?: string[];
  // For tool_data
  periodLabel?: string;
  // For verification
  unverifiedFigures?: string[];
}

interface SessionMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolsUsed?: string[];
  error?: boolean;
  analyticsData?: AnalyticsDataBlock[];
}

export interface ChatSession {
  id: string;
  title: string;
  /** Experience the conversation is scoped to (null = all experiences) */
  experienceId: string | null;
  experienceName: string | null;
  messages: SessionMessage[];
  messageCount: number;
  createdAt: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  experienceId: string | null;
  experienceName: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

interface SessionsResponse {
  success: boolean;
  data: {
    sessions: ChatSessionSummary[];
    pagination: {
      limit: number;
      offset: number;
      total: number;
      hasMore: boolean;
    };
  };
}

// ============================================================================
// SESSIONS
// ============================================================================

export function useChatSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['admin-chat-session', sessionId],
    queryFn: async (): Promise<ChatSession> => {
      if (!sessionId) throw new Error('No session ID');
      const response = await fetch(`/api/analytics/chat/sessions/${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch session');
      const data = await response.json();
      return data.data;
    },
    enabled: !!sessionId,
    staleTime: 0,
  });
}

/** The 50 most recent conversations, or those matching `search` (title, experience or anything said) */
export function useChatSessions({ enabled = true, search = '' }: { enabled?: boolean; search?: string } = {}) {
  const q = search.trim();
  return useQuery({
    queryKey: ['admin-chat-sessions', q],
    enabled,
    queryFn: async (): Promise<SessionsResponse> => {
      const params = new URLSearchParams({ limit: '50' });
      if (q) params.set('q', q);
      const response = await fetch(`/api/analytics/chat/sessions?${params}`);
      if (!response.ok) throw new Error('Failed to fetch sessions');
      return response.json();
    },
    placeholderData: keepPreviousData,
    staleTime: 30000,
  });
}

/** Delete a conversation for everyone; it disappears from every history list */
export function useDeleteChatSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await fetch(`/api/analytics/chat/sessions/${sessionId}`, { method: 'DELETE' });
      // Already gone is as good as deleted
      if (!response.ok && response.status !== 404) throw new Error('Failed to delete conversation');
      return sessionId;
    },
    onSuccess: (sessionId) => {
      queryClient.removeQueries({ queryKey: ['admin-chat-session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['admin-chat-sessions'] });
    },
  });
}

// ============================================================================
// CONVERSATION
// ============================================================================

interface UseAnalyticsChatOptions {
  /** Model to answer with; omit both to use the system's default chat model */
  providerId?: string | null;
  modelId?: number | null;
}

export function useAnalyticsChat({ providerId, modelId }: UseAnalyticsChatOptions = {}) {
  const queryClient = useQueryClient();
  const { experienceId, experienceName, setExperience, timeRange, period, timeZone } = useAnalyticsContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Experience the open conversation is scoped to: undefined = no conversation yet, null = all experiences
  const conversationScopeRef = useRef<string | null | undefined>(undefined);
  const [scopeNotice, setScopeNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string>('');
  const [activeTool, setActiveTool] = useState<string>('');
  const [toolsExecuted, setToolsExecuted] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Session created by the conversation on screen. Its messages are already
  // shown, with follow-ups and checks the stored copy doesn't keep.
  const streamedSessionIdRef = useRef<string | null>(null);

  const { data: session } = useChatSession(sessionId);

  // Load session messages when session changes, and switch the page to the
  // experience the conversation is scoped to
  useEffect(() => {
    if (session?.messages && session.id !== streamedSessionIdRef.current) {
      const sessionScope = session.experienceId ?? null;
      conversationScopeRef.current = sessionScope;
      setScopeNotice(null);
      // Always re-apply a stored experience so its scope survives even if the
      // experience has since been deleted (the selector shows it as deleted)
      if (sessionScope) {
        setExperience(sessionScope, session.experienceName ?? undefined, undefined, { keepWhenMissing: true });
      } else if (experienceId) {
        setExperience(undefined);
      }
      const loadedMessages: ChatMessage[] = session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
        toolsUsed: m.toolsUsed,
        error: m.error,
        analyticsData: m.analyticsData,
      }));
      setMessages(loadedMessages);
    }
    // Only react to a newly loaded session, not to later experience changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // A conversation stays scoped to one experience. Switching experience mid-conversation
  // starts a new one (the old one stays in History) instead of mixing the two.
  useEffect(() => {
    const scope = conversationScopeRef.current;
    if (scope === undefined || scope === (experienceId ?? null)) return;
    abortControllerRef.current?.abort();
    conversationScopeRef.current = undefined;
    setSessionId(null);
    setMessages([]);
    setScopeNotice('You switched experience, so a new conversation was started. The previous one is still in History.');
  }, [experienceId]);

  /** Ask a question; `pageSection` names the analytics section it was asked from */
  const send = useCallback(async (content: string, { pageSection }: { pageSection?: string } = {}) => {
    if (!content || isLoading) return;

    // The first message fixes the conversation's scope
    if (conversationScopeRef.current === undefined) {
      conversationScopeRef.current = experienceId ?? null;
    }
    setScopeNotice(null);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    // Generate streaming message ID upfront so we can add it before fetch
    const streamingMessageId = crypto.randomUUID();

    // Add both user message and streaming placeholder immediately
    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        id: streamingMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
        analyticsData: [],
      },
    ]);
    setIsLoading(true);
    setStreamStatus('Connecting...');
    setActiveTool('');
    setToolsExecuted([]);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/analytics/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          sessionId,
          providerId: providerId ?? undefined,
          modelId: modelId ?? undefined,
          experienceId,
          experienceName: experienceId ? experienceName : undefined,
          timeRange,
          // The exact period on the page, resolved now; the chat answers for it by default
          period: (() => {
            const { from, to } = resolvePeriod(period);
            return { from: from.toISOString(), to: to.toISOString() };
          })(),
          timeZone,
          pageSection,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let streamedContent = '';
      const finalToolsUsed: string[] = [];
      const collectedAnalyticsData: AnalyticsDataBlock[] = [];
      let collectedSuggestedFollowUps: string[] = [];
      let collectedDataStatus: 'has_data' | 'no_data' | 'sparse_data' | 'anomaly' | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const chunk = JSON.parse(data) as StreamChunk;

              switch (chunk.type) {
                case 'status':
                  setStreamStatus(chunk.message || '');
                  break;

                case 'tool_start':
                  setActiveTool(chunk.tool || '');
                  setStreamStatus(`Querying ${chunk.tool}...`);
                  break;

                case 'tool_data':
                  if (chunk.tool && chunk.dataType && chunk.data) {
                    // Deduplicate: replace existing entry with same dataType, or add new
                    const existingIndex = collectedAnalyticsData.findIndex(
                      (d) => d.dataType === chunk.dataType
                    );
                    if (existingIndex >= 0) {
                      // Replace with latest data
                      collectedAnalyticsData[existingIndex] = {
                        tool: chunk.tool,
                        dataType: chunk.dataType,
                        data: chunk.data,
                        periodLabel: chunk.periodLabel,
                      };
                    } else {
                      collectedAnalyticsData.push({
                        tool: chunk.tool,
                        dataType: chunk.dataType,
                        data: chunk.data,
                        periodLabel: chunk.periodLabel,
                      });
                    }
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === streamingMessageId
                          ? { ...m, analyticsData: [...collectedAnalyticsData] }
                          : m
                      )
                    );
                  }
                  break;

                case 'tool_result':
                  if (chunk.tool) {
                    setToolsExecuted((prev) => [...prev, chunk.tool!]);
                    finalToolsUsed.push(chunk.tool);
                  }
                  setActiveTool('');
                  setStreamStatus('Processing results...');
                  break;

                case 'response_metadata':
                  // Store the metadata for the final message
                  if (chunk.suggestedFollowUps) {
                    collectedSuggestedFollowUps = chunk.suggestedFollowUps;
                  }
                  if (chunk.dataStatus) {
                    collectedDataStatus = chunk.dataStatus;
                  }
                  // Update message with metadata immediately
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === streamingMessageId
                        ? {
                            ...m,
                            suggestedFollowUps: chunk.suggestedFollowUps || [],
                            dataStatus: chunk.dataStatus,
                          }
                        : m
                    )
                  );
                  break;

                case 'content':
                  streamedContent += chunk.content || '';
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === streamingMessageId
                        ? { ...m, content: streamedContent }
                        : m
                    )
                  );
                  setStreamStatus('');
                  break;

                case 'done':
                  if (chunk.sessionId && chunk.sessionId !== sessionId) {
                    streamedSessionIdRef.current = chunk.sessionId;
                    setSessionId(chunk.sessionId);
                    queryClient.invalidateQueries({ queryKey: ['admin-chat-sessions'] });
                  }
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === streamingMessageId
                        ? {
                            ...m,
                            content: withoutFollowUps(streamedContent, collectedSuggestedFollowUps),
                            isStreaming: false,
                            toolsUsed: chunk.toolsUsed || finalToolsUsed,
                            analyticsData: collectedAnalyticsData.length > 0 ? collectedAnalyticsData : undefined,
                            suggestedFollowUps: collectedSuggestedFollowUps.length > 0 ? collectedSuggestedFollowUps : undefined,
                            dataStatus: collectedDataStatus,
                          }
                        : m
                    )
                  );
                  break;

                case 'verification':
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === streamingMessageId ? { ...m, unverifiedFigures: chunk.unverifiedFigures ?? [] } : m
                    )
                  );
                  break;

                case 'error':
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === streamingMessageId
                        ? {
                            ...m,
                            content: chunk.error || 'An error occurred',
                            isStreaming: false,
                            error: true,
                          }
                        : m
                    )
                  );
                  break;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingMessageId && m.isStreaming
            ? { ...m, isStreaming: false, toolsUsed: finalToolsUsed }
            : m
        )
      );
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setMessages((prev) => prev.filter((m) => !m.isStreaming));
      } else {
        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: (error as Error).message || 'Failed to connect to the analytics service.',
          timestamp: new Date(),
          error: true,
        };
        setMessages((prev) => [...prev.filter((m) => !m.isStreaming), errorMessage]);
      }
    } finally {
      setIsLoading(false);
      setStreamStatus('');
      setActiveTool('');
      setToolsExecuted([]);
      abortControllerRef.current = null;
    }
  }, [isLoading, sessionId, providerId, modelId, experienceId, experienceName, timeRange, period, timeZone, queryClient]);

  /** Start a fresh conversation; the current one stays in history. */
  const startNew = useCallback(() => {
    streamedSessionIdRef.current = null;
    conversationScopeRef.current = undefined;
    setScopeNotice(null);
    setSessionId(null);
    setMessages([]);
  }, []);

  /** Open a saved conversation. */
  const openSession = useCallback((id: string) => {
    if (id === streamedSessionIdRef.current) return;
    streamedSessionIdRef.current = null;
    setSessionId((current) => (id !== current ? id : current));
  }, []);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    messages,
    isLoading,
    streamStatus,
    activeTool,
    toolsExecuted,
    sessionId,
    session,
    scopeNotice,
    send,
    stop,
    startNew,
    openSession,
  };
}

/** The answer text without its trailing follow-up lines, which show as chips instead */
function withoutFollowUps(content: string, followUps: string[]): string {
  if (followUps.length === 0) return content;
  const lines = content.split('\n');
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (last === '' || (last.startsWith('- ') && followUps.includes(last.slice(2).trim()))) lines.pop();
    else break;
  }
  return lines.join('\n');
}
