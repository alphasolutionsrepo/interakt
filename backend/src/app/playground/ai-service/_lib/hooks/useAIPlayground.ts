// app/playground/ai-service/_lib/hooks/useAIPlayground.ts

/**
 * AI Playground Hooks
 * 
 * React Query hooks for AI service playground operations.
 */

'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  aiServiceApi,
  ApiError,
  type TextGenerationRequest,
  type TextGenerationResponse,
  type ChatRequest,
  type ChatResponse,
  type ChatStreamChunk,
  type ChatMessage,
  type EmbeddingsRequest,
  type EmbeddingsResponse,
} from '../api-client';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const aiPlaygroundKeys = {
  all: ['ai-playground'] as const,
  providers: () => [...aiPlaygroundKeys.all, 'providers'] as const,
};

// ============================================================================
// PROVIDERS HOOK
// ============================================================================

/**
 * Hook to fetch available AI providers and models
 */
export function useAIProviders() {
  return useQuery({
    queryKey: aiPlaygroundKeys.providers(),
    queryFn: () => aiServiceApi.getProviders(),
    staleTime: 60000, // 1 minute
  });
}

// ============================================================================
// TEXT GENERATION HOOK
// ============================================================================

/**
 * Hook for text generation with loading state
 */
export function useTextGeneration() {
  const [result, setResult] = useState<TextGenerationResponse | null>(null);

  const mutation = useMutation({
    mutationFn: (request: TextGenerationRequest) =>
      aiServiceApi.generateText(request),
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Text generation failed');
    },
  });

  const generate = useCallback(
    (request: TextGenerationRequest) => {
      setResult(null);
      return mutation.mutateAsync(request);
    },
    [mutation]
  );

  const reset = useCallback(() => {
    setResult(null);
    mutation.reset();
  }, [mutation]);

  return {
    generate,
    result,
    isLoading: mutation.isPending,
    error: mutation.error,
    reset,
  };
}

// ============================================================================
// CHAT HOOK (Non-streaming)
// ============================================================================

/**
 * Hook for chat completion without streaming
 */
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastResponse, setLastResponse] = useState<ChatResponse | null>(null);

  const mutation = useMutation({
    mutationFn: (request: ChatRequest) => aiServiceApi.chat(request),
    onSuccess: (data) => {
      setLastResponse(data);
      setMessages((prev) => [...prev, data.message]);
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Chat failed');
    },
  });

  const sendMessage = useCallback(
    async (content: string, options?: Omit<ChatRequest, 'messages'>) => {
      const userMessage: ChatMessage = { role: 'user', content };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);

      return mutation.mutateAsync({
        messages: newMessages,
        ...options,
      });
    },
    [messages, mutation]
  );

  const setSystemPrompt = useCallback((content: string) => {
    const systemMessage: ChatMessage = { role: 'system', content };
    setMessages((prev) => {
      // Replace existing system message or add at beginning
      const withoutSystem = prev.filter((m) => m.role !== 'system');
      return [systemMessage, ...withoutSystem];
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setLastResponse(null);
    mutation.reset();
  }, [mutation]);

  return {
    messages,
    sendMessage,
    setSystemPrompt,
    clearMessages,
    lastResponse,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

// ============================================================================
// STREAMING CHAT HOOK
// ============================================================================

/**
 * Hook for chat completion with streaming
 */
export function useStreamingChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentResponse, setCurrentResponse] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [usage, setUsage] = useState<ChatStreamChunk['usage'] | null>(null);
  const [metadata, setMetadata] = useState<ChatStreamChunk['metadata'] | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string, options?: Omit<ChatRequest, 'messages' | 'stream'>) => {
      // Add user message
      const userMessage: ChatMessage = { role: 'user', content };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setCurrentResponse('');
      setUsage(null);
      setMetadata(null);
      setIsStreaming(true);

      try {
        let fullResponse = '';

        for await (const chunk of aiServiceApi.chatStream({
          messages: newMessages,
          ...options,
        })) {
          if (chunk.content) {
            fullResponse += chunk.content;
            setCurrentResponse(fullResponse);
          }
          if (chunk.usage) {
            setUsage(chunk.usage);
          }
          if (chunk.metadata) {
            setMetadata(chunk.metadata);
          }
          if (chunk.done) {
            break;
          }
        }

        // Add assistant message to history
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: fullResponse,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setCurrentResponse('');
      } catch (error) {
        const err = error as ApiError;
        toast.error(err.message || 'Chat failed');
      } finally {
        setIsStreaming(false);
      }
    },
    [messages]
  );

  const setSystemPrompt = useCallback((content: string) => {
    const systemMessage: ChatMessage = { role: 'system', content };
    setMessages((prev) => {
      const withoutSystem = prev.filter((m) => m.role !== 'system');
      return [systemMessage, ...withoutSystem];
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentResponse('');
    setUsage(null);
    setMetadata(null);
  }, []);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return {
    messages,
    currentResponse,
    sendMessage,
    setSystemPrompt,
    clearMessages,
    stopStreaming,
    isStreaming,
    usage,
    metadata,
  };
}

// ============================================================================
// EMBEDDINGS HOOK
// ============================================================================

/**
 * Hook for embedding generation
 */
export function useEmbeddings() {
  const [result, setResult] = useState<EmbeddingsResponse | null>(null);

  const mutation = useMutation({
    mutationFn: (request: EmbeddingsRequest) =>
      aiServiceApi.generateEmbeddings(request),
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (error: ApiError) => {
      toast.error(error.message || 'Embedding generation failed');
    },
  });

  const generate = useCallback(
    (request: EmbeddingsRequest) => {
      setResult(null);
      return mutation.mutateAsync(request);
    },
    [mutation]
  );

  const reset = useCallback(() => {
    setResult(null);
    mutation.reset();
  }, [mutation]);

  return {
    generate,
    result,
    isLoading: mutation.isPending,
    error: mutation.error,
    reset,
  };
}

// ============================================================================
// PLAYGROUND STATE HOOK
// ============================================================================

export type PlaygroundTab = 'text' | 'chat' | 'embeddings';

/**
 * Hook for managing playground state
 */
export function usePlaygroundState() {
  const [activeTab, setActiveTab] = useState<PlaygroundTab>('text');
  const [showPanel, setShowPanel] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<number | null>(null);

  // Parameters
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [topP, setTopP] = useState(1);
  const [systemPrompt, setSystemPrompt] = useState('');

  const resetParameters = useCallback(() => {
    setTemperature(0.7);
    setMaxTokens(1024);
    setTopP(1);
    setSystemPrompt('');
  }, []);

  return {
    // Tab & Panel
    activeTab,
    setActiveTab,
    showPanel,
    setShowPanel,

    // Provider/Model selection
    selectedProvider,
    setSelectedProvider,
    selectedModel,
    setSelectedModel,

    // Parameters
    temperature,
    setTemperature,
    maxTokens,
    setMaxTokens,
    topP,
    setTopP,
    systemPrompt,
    setSystemPrompt,

    // Actions
    resetParameters,
  };
}