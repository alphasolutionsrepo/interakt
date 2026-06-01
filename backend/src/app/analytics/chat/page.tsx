// app/analytics/chat/page.tsx

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/shared/ui/components/button';
import { Textarea } from '@/shared/ui/components/textarea';
import { Skeleton } from '@/shared/ui/components/skeleton';
import { Badge } from '@/shared/ui/components/badge';
import { Input } from '@/shared/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/components/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/components/popover';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Settings2,
  Cpu,
  Zap,
  MessageSquare,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Wrench,
  StopCircle,
  Plus,
  History,
  Search,
  X,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnalyticsDataRenderer } from './_components/AnalyticsDataRenderer';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { ExperienceSelector } from '../_components/ExperienceSelector';
import { useAnalyticsContext } from '../_lib/AnalyticsContext';

// ============================================================================
// TYPES
// ============================================================================

interface AnalyticsDataBlock {
  tool: string;
  dataType: string;
  data: unknown;
}

interface ChatMessage {
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
}

interface StreamChunk {
  type: 'status' | 'tool_start' | 'tool_result' | 'tool_data' | 'content' | 'done' | 'error' | 'response_metadata';
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
}

interface AIProvider {
  id: string;
  key: string;
  name: string;
  type: 'cloud' | 'local';
  isEnabled: boolean;
  models: AIModel[];
}

interface AIModel {
  id: number;
  key: string;
  name: string;
  type: string;
  contextWindow?: number;
}

interface ProvidersResponse {
  providers: AIProvider[];
  defaults: {
    textGeneration: { providerId: string; modelId: number } | null;
    embedding: { providerId: string; modelId: number } | null;
    chat: { providerId: string; modelId: number } | null;
  };
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

interface Session {
  id: string;
  title: string;
  messages: SessionMessage[];
  messageCount: number;
  createdAt: string;
}

interface SessionSummary {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

interface SessionsResponse {
  success: boolean;
  data: {
    sessions: SessionSummary[];
    pagination: {
      limit: number;
      offset: number;
      total: number;
      hasMore: boolean;
    };
  };
}

// ============================================================================
// PROCESSING STATUS (compact banner for chat page)
// ============================================================================

function useProcessingStatus() {
  return useQuery({
    queryKey: ['analytics', 'processing-status'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/process');
      if (!res.ok) throw new Error('Failed to fetch status');
      const json = await res.json();
      return json.data as {
        lastRun: { id: string; status: string; completedAt: string | null } | null;
        currentRun: { id: string; status: string } | null;
        isStale: boolean;
      };
    },
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

function ProcessingStatusBanner() {
  const { data: status, refetch } = useProcessingStatus();
  const { experienceId } = useAnalyticsContext();
  const [isProcessing, setIsProcessing] = useState(false);

  const triggerProcessing = useCallback(async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/analytics/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggeredBy: 'admin', experienceId }),
      });
      if (res.status === 409) { refetch(); return; }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (decoder.decode(value).includes('[DONE]')) break;
        }
      }
    } finally {
      setIsProcessing(false);
      refetch();
    }
  }, [refetch]);

  const isRunning = isProcessing || status?.currentRun?.status === 'running';
  const isStale = status?.isStale ?? true;
  const lastCompletedAt = status?.lastRun?.completedAt;

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="flex items-center justify-between rounded-xl border bg-card/80 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        <Sparkles className="h-4 w-4 text-violet-500" />
        <div>
          {isRunning ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Processing chat insights...
            </span>
          ) : lastCompletedAt ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {isStale ? (
                <><AlertTriangle className="h-3 w-3 text-amber-500" /> Chat data {formatTimeAgo(lastCompletedAt)} — may be stale</>
              ) : (
                <><CheckCircle2 className="h-3 w-3 text-green-500" /> Chat data processed {formatTimeAgo(lastCompletedAt)}</>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <AlertTriangle className="h-3 w-3 text-amber-500" /> Process data to enable business insight tools
            </span>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">Powers intent analysis, catalog health, AI effectiveness, and other business-focused tools</p>
        </div>
      </div>
      <Button
        variant={isStale && !isRunning ? 'default' : 'ghost'}
        size="sm"
        onClick={triggerProcessing}
        disabled={isRunning}
        className="h-7 text-xs rounded-lg"
      >
        {isRunning ? (
          <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Processing</>
        ) : (
          <><Sparkles className="mr-1.5 h-3 w-3" /> Process Data</>
        )}
      </Button>
    </div>
  );
}

// ============================================================================
// SUGGESTED QUESTIONS
// ============================================================================

const SUGGESTED_QUESTIONS = [
  {
    category: 'Business Insights',
    icon: Zap,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/15',
    questions: [
      'What should I focus on?',
      'What are customers looking for?',
      'Is the AI helping customers?',
    ],
  },
  {
    category: 'Catalog & Content',
    icon: Cpu,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/15',
    questions: [
      'Where is my catalog failing?',
      'What content gaps should I address?',
      'How much is AI costing me?',
    ],
  },
  {
    category: 'Trends & Performance',
    icon: MessageSquare,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/15',
    questions: [
      'What\'s trending this week?',
      'Show me the top search queries',
      'What is our search response time?',
    ],
  },
];

// ============================================================================
// HOOKS
// ============================================================================

function useAIProviders() {
  return useQuery({
    queryKey: ['ai-providers-for-chat'],
    queryFn: async (): Promise<ProvidersResponse> => {
      const response = await fetch('/api/ai-service/providers');
      if (!response.ok) throw new Error('Failed to fetch providers');
      const data = await response.json();
      return data.success ? data.data : data;
    },
    staleTime: 60000,
  });
}

function useSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['admin-chat-session', sessionId],
    queryFn: async (): Promise<Session> => {
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

function useSessions() {
  return useQuery({
    queryKey: ['admin-chat-sessions'],
    queryFn: async (): Promise<SessionsResponse> => {
      const response = await fetch('/api/analytics/chat/sessions?limit=50');
      if (!response.ok) throw new Error('Failed to fetch sessions');
      return response.json();
    },
    staleTime: 30000,
  });
}

// ============================================================================
// COMPONENTS
// ============================================================================

interface MessageBubbleProps {
  message: ChatMessage;
  onFollowUpClick?: (question: string) => void;
  streamingState?: {
    status?: string;
    activeTool?: string;
    toolsExecuted?: string[];
  };
}

function MessageBubble({ message, onFollowUpClick, streamingState }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const hasContent = message.content && message.content.length > 0;
  const hasAnalyticsData = message.analyticsData && message.analyticsData.length > 0;
  // Show loading animation until text content starts streaming (analytics data can appear alongside)
  const isActivelyStreaming = message.isStreaming && !hasContent;

  // Get phase and phrases for streaming state
  const phase = streamingState ? getPhaseFromStatus(streamingState.status, streamingState.activeTool) : 'thinking';
  const phrases = streamingState?.activeTool && TOOL_PHRASES[streamingState.activeTool]
    ? TOOL_PHRASES[streamingState.activeTool]
    : LOADING_PHRASES[phase];
  const { phrase, isVisible } = useRotatingPhrase(phrases, 2500);

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : '')}>
      {/* Avatar */}
      <div className="relative flex size-9 shrink-0 items-center justify-center mt-0.5">
        {/* Pulsing ring for streaming state */}
        {message.isStreaming && !message.error && (
          <div
            className="absolute inset-0 animate-ping rounded-xl bg-violet-500/20 opacity-75"
            style={{ animationDuration: '2s' }}
          />
        )}
        <div
          className={cn(
            'relative flex size-9 items-center justify-center rounded-xl transition-all duration-300',
            isUser
              ? 'bg-primary text-primary-foreground'
              : message.error
                ? 'bg-red-100 dark:bg-red-900'
                : 'bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900 dark:to-purple-900 shadow-sm'
          )}
        >
          {isUser ? (
            <User className="size-4" />
          ) : message.error ? (
            <AlertCircle className="size-4 text-red-600 dark:text-red-400" />
          ) : message.isStreaming ? (
            <Sparkles className="size-4 text-violet-600 dark:text-violet-400 animate-pulse" />
          ) : (
            <Sparkles className="size-4 text-violet-600 dark:text-violet-400" />
          )}
        </div>
      </div>

      {/* Content */}
      <div
        className={cn(
          'flex-1 max-w-[90%] min-w-0 rounded-2xl px-5 py-4 overflow-hidden transition-all duration-300',
          isUser
            ? 'bg-primary text-primary-foreground'
            : message.error
              ? 'border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50'
              : 'bg-gradient-to-br from-muted/80 to-muted/40 shadow-sm'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {message.content}
          </p>
        ) : (
          <div className="space-y-3">
            {/* Streaming status indicator - shows when no content yet */}
            {isActivelyStreaming && streamingState && (
              <div className="animate-in fade-in-0 duration-300">
                <div className="flex flex-col gap-2">
                  {/* Rotating phrase with fade animation */}
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      <div className="size-1 rounded-full bg-violet-500 animate-[pulse_1s_ease-in-out_infinite]" />
                      <div className="size-1 rounded-full bg-violet-500 animate-[pulse_1s_ease-in-out_infinite_0.2s]" />
                      <div className="size-1 rounded-full bg-violet-500 animate-[pulse_1s_ease-in-out_infinite_0.4s]" />
                    </div>
                    <span
                      className={cn(
                        "text-sm font-medium text-foreground/80 transition-all duration-200",
                        isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
                      )}
                    >
                      {phrase}
                    </span>
                  </div>

                  {/* Active tool indicator */}
                  {streamingState.activeTool && (
                    <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-300">
                      <div className="flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5">
                        <div className="relative">
                          <Wrench className="size-2.5 text-violet-600 dark:text-violet-400" />
                          <div className="absolute inset-0 animate-ping">
                            <Wrench className="size-2.5 text-violet-600/50 dark:text-violet-400/50" />
                          </div>
                        </div>
                        <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
                          {streamingState.activeTool.replace(/_/g, ' ').replace(/^get /, '')}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Completed tools */}
                  {streamingState.toolsExecuted && streamingState.toolsExecuted.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {streamingState.toolsExecuted.map((tool, index) => (
                        <Badge
                          key={tool}
                          variant="secondary"
                          className={cn(
                            "text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0 py-0.5 px-2",
                            "animate-in fade-in-0 zoom-in-95 duration-300"
                          )}
                          style={{ animationDelay: `${index * 100}ms` }}
                        >
                          <CheckCircle2 className="mr-0.5 size-2" />
                          {tool.replace(/_/g, ' ').replace(/^get /, '')}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Analytics data cards - animate in */}
            {hasAnalyticsData && (
              <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
                <AnalyticsDataRenderer dataBlocks={message.analyticsData!} />
              </div>
            )}

            {/* Text content - streams in naturally */}
            {hasContent && (
              <div className={cn(
                'prose prose-sm max-w-none dark:prose-invert animate-in fade-in-0 duration-300',
                'prose-p:my-1 prose-p:leading-relaxed',
                'prose-ul:my-2 prose-ol:my-2',
                'prose-li:my-0.5',
                'prose-headings:my-2 prose-headings:font-semibold',
                'prose-h1:text-base prose-h2:text-sm prose-h3:text-sm',
                'prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none',
                'prose-pre:my-2 prose-pre:rounded-lg prose-pre:bg-muted prose-pre:p-3 prose-pre:text-xs',
                'prose-table:my-3 prose-table:w-full prose-table:border-collapse prose-table:rounded-lg prose-table:overflow-hidden prose-table:text-sm',
                'prose-thead:bg-muted/50',
                'prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:border-b prose-th:border-border',
                'prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-border/50',
                'prose-tr:hover:bg-muted/30',
                'prose-strong:font-semibold',
                message.error && 'text-red-700 dark:text-red-300',
                hasAnalyticsData && 'mt-4 pt-4 border-t border-border/30'
              )}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
                {message.isStreaming && (
                  <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-violet-500 rounded-full" />
                )}
              </div>
            )}
          </div>
        )}

        {/* Tools used badges */}
        {!message.isStreaming && message.toolsUsed && message.toolsUsed.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/50 pt-2.5 animate-in fade-in-0 duration-300">
            {message.toolsUsed.map((tool) => (
              <Badge key={tool} variant="secondary" className="text-xs font-normal py-0.5 px-2">
                {tool.replace(/_/g, ' ').replace(/^get /, '')}
              </Badge>
            ))}
          </div>
        )}

        {/* Follow-up suggestion chips */}
        {!message.isStreaming && message.suggestedFollowUps && message.suggestedFollowUps.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-500">
            <span className="mr-0.5 text-xs text-muted-foreground self-center">Follow up:</span>
            {message.suggestedFollowUps.map((followUp, i) => (
              <button
                key={i}
                onClick={() => onFollowUpClick?.(followUp)}
                className="text-xs px-3 py-1.5 rounded-full bg-violet-100 hover:bg-violet-200 dark:bg-violet-900/50 dark:hover:bg-violet-800/50 text-violet-700 dark:text-violet-300 transition-colors cursor-pointer"
              >
                {followUp}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        {!message.isStreaming && (
          <p className="mt-2 text-xs text-muted-foreground">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  );
}

// Contextual loading phrases that rotate based on what's happening
const LOADING_PHRASES = {
  idle: [
    'Preparing your insights',
    'Getting ready to analyze',
    'Initializing analytics engine',
  ],
  connecting: [
    'Establishing connection',
    'Connecting to data sources',
    'Preparing query pipeline',
  ],
  thinking: [
    'Understanding your question',
    'Analyzing context',
    'Determining best approach',
    'Processing your request',
  ],
  fetching: [
    'Querying analytics data',
    'Gathering metrics',
    'Fetching insights',
    'Collecting data points',
  ],
  analyzing: [
    'Analyzing patterns',
    'Processing results',
    'Identifying trends',
    'Crunching numbers',
  ],
  generating: [
    'Crafting response',
    'Preparing insights',
    'Generating analysis',
    'Composing summary',
  ],
};

// Tool-specific phrases
const TOOL_PHRASES: Record<string, string[]> = {
  get_search_overview: ['Fetching search metrics', 'Gathering search statistics', 'Analyzing search activity'],
  get_search_trends: ['Charting search trends', 'Analyzing volume patterns', 'Tracking search history'],
  get_popular_queries: ['Finding top queries', 'Ranking popular searches', 'Analyzing query frequency'],
  get_zero_result_queries: ['Identifying content gaps', 'Finding failed searches', 'Analyzing zero-result patterns'],
  get_search_type_breakdown: ['Breaking down search types', 'Categorizing searches', 'Analyzing search methods'],
  get_search_performance: ['Measuring latency', 'Analyzing response times', 'Checking performance metrics'],
  get_ai_usage: ['Calculating AI costs', 'Measuring token usage', 'Analyzing AI activity'],
  get_tool_usage: ['Tracking tool executions', 'Measuring tool performance', 'Analyzing tool patterns'],
  get_recent_searches: ['Loading recent activity', 'Fetching latest searches', 'Getting live data'],
  get_query_search_events: ['Investigating search events', 'Analyzing query patterns', 'Digging into details'],
  respond_with_analytics: ['Formatting response', 'Preparing insights', 'Composing analysis'],
};

function useRotatingPhrase(phrases: string[], intervalMs: number = 2500) {
  const [index, setIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % phrases.length);
        setIsVisible(true);
      }, 200);
    }, intervalMs);

    return () => clearInterval(interval);
  }, [phrases, intervalMs]);

  return { phrase: phrases[index], isVisible };
}

function getPhaseFromStatus(status?: string, activeTool?: string): keyof typeof LOADING_PHRASES {
  if (!status) return 'idle';
  const lower = status.toLowerCase();
  if (lower.includes('connect')) return 'connecting';
  if (lower.includes('think') || lower.includes('understand')) return 'thinking';
  if (lower.includes('fetch') || lower.includes('query') || lower.includes('gathering') || activeTool) return 'fetching';
  if (lower.includes('analyz') || lower.includes('process')) return 'analyzing';
  if (lower.includes('generat') || lower.includes('craft') || lower.includes('prepar')) return 'generating';
  return 'thinking';
}

interface HistorySheetProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SessionSummary[];
  isLoading: boolean;
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}

function HistorySheet({ isOpen, onClose, sessions, isLoading, currentSessionId, onSelectSession }: HistorySheetProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSessions = sessions.filter(session =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (sessionId: string) => {
    onSelectSession(sessionId);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 mx-auto max-w-3xl px-4 transition-all duration-300 ease-out',
          isOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        )}
      >
        <div className="rounded-t-2xl border border-b-0 border-border/60 bg-card shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <History className="size-5 text-muted-foreground" />
              <h3 className="font-semibold">Chat History</h3>
              <Badge variant="secondary" className="text-xs">
                {sessions.length}
              </Badge>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-lg">
              <X className="size-4" />
            </Button>
          </div>

          {/* Search */}
          <div className="border-b px-4 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 rounded-xl border-border/60"
              />
            </div>
          </div>

          {/* Sessions List */}
          <div className="max-h-[50vh] overflow-y-auto p-2">
            {isLoading ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <MessageSquare className="size-10 text-muted-foreground/30" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {searchQuery ? 'No matching conversations' : 'No chat history yet'}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredSessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => handleSelect(session.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors',
                      session.id === currentSessionId
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted'
                    )}
                  >
                    <div className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-lg',
                      session.id === currentSessionId ? 'bg-primary/20' : 'bg-muted'
                    )}>
                      <MessageSquare className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{session.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {session.messageCount} messages
                        {session.lastMessageAt && (
                          <> · {formatDistanceToNow(new Date(session.lastMessageAt), { addSuffix: true })}</>
                        )}
                      </p>
                    </div>
                    {session.id === currentSessionId && (
                      <CheckCircle2 className="size-4 shrink-0 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AnalyticsChatPage() {
  const queryClient = useQueryClient();
  const { experienceId, experienceName } = useAnalyticsContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [streamStatus, setStreamStatus] = useState<string>('');
  const [activeTool, setActiveTool] = useState<string>('');
  const [toolsExecuted, setToolsExecuted] = useState<string[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { data: providersData, isLoading: isLoadingProviders } = useAIProviders();
  const { data: sessionData } = useSession(currentSessionId);
  const { data: sessionsData, isLoading: isLoadingSessions } = useSessions();

  const sessions = sessionsData?.data?.sessions || [];

  // Initialize with defaults when providers data loads
  useEffect(() => {
    if (providersData?.defaults?.chat?.providerId && !selectedProviderId) {
      setSelectedProviderId(providersData.defaults.chat.providerId);
    }
  }, [providersData?.defaults?.chat?.providerId, selectedProviderId]);

  useEffect(() => {
    if (providersData?.defaults?.chat?.modelId && selectedProviderId && !selectedModelId) {
      setSelectedModelId(providersData.defaults.chat.modelId);
    }
  }, [providersData?.defaults?.chat?.modelId, selectedProviderId, selectedModelId]);

  // Load session messages when session changes
  useEffect(() => {
    if (sessionData?.messages) {
      const loadedMessages: ChatMessage[] = sessionData.messages.map((m) => ({
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
  }, [sessionData]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = useCallback(async (messageContent?: string) => {
    const content = messageContent || input.trim();
    if (!content || isLoading) return;

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
    setInput('');
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
          sessionId: currentSessionId,
          providerId: selectedProviderId,
          modelId: selectedModelId,
          experienceId,
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
                      };
                    } else {
                      collectedAnalyticsData.push({
                        tool: chunk.tool,
                        dataType: chunk.dataType,
                        data: chunk.data,
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
                  if (chunk.sessionId && chunk.sessionId !== currentSessionId) {
                    setCurrentSessionId(chunk.sessionId);
                    queryClient.invalidateQueries({ queryKey: ['admin-chat-sessions'] });
                  }
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === streamingMessageId
                        ? {
                            ...m,
                            content: streamedContent,
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
  }, [input, isLoading, currentSessionId, selectedProviderId, selectedModelId, experienceId, queryClient]);

  const handleSuggestedQuestion = useCallback((question: string) => {
    handleSubmit(question);
  }, [handleSubmit]);

  const handleNewSession = useCallback(() => {
    setCurrentSessionId(null);
    setMessages([]);
  }, []);

  const handleSelectSession = useCallback((sessionId: string) => {
    if (sessionId !== currentSessionId) {
      setCurrentSessionId(sessionId);
    }
  }, [currentSessionId]);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleFormSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit();
  }, [handleSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const canChat = selectedProviderId && selectedModelId;
  const currentSessionTitle = sessionData?.title || 'New Conversation';

  const hasMessages = messages.length > 0;

  // Provider settings popover content (reused in both states)
  const providerSettingsContent = (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Settings2 className="size-4 text-primary" />
        AI Provider
      </div>
      <div className="space-y-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Provider</label>
          {isLoadingProviders ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select value={selectedProviderId || ''} onValueChange={setSelectedProviderId}>
              <SelectTrigger className="w-full rounded-lg">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {(providersData?.providers || []).filter(p => p.isEnabled).map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Model</label>
          {isLoadingProviders ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select
              value={selectedModelId?.toString() || ''}
              onValueChange={(v) => setSelectedModelId(parseInt(v))}
              disabled={!selectedProviderId}
            >
              <SelectTrigger className="w-full rounded-lg">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {(providersData?.providers
                  .find(p => p.id === selectedProviderId)?.models
                  .filter(m => m.type === 'chat' || m.type === 'text_generation') || []
                ).map((model) => (
                  <SelectItem key={model.id} value={model.id.toString()}>
                    {model.name || model.key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
    </div>
  );

  // Empty state - use same negative margin trick to break out of mainDiv padding
  // This ensures alignment with other analytics pages and prevents overflow
  if (!hasMessages) {
    return (
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-8 flex h-[calc(100vh-64px)] flex-col">
        {/* Header */}
        <div className="border-b p-6">
          <PageHeader
            variant="hero"
            title="Analytics Chat"
            description="AI-powered insights into your search data"
            icon={MessageSquare}
            iconBg="bg-violet-500/10"
            iconColor="text-violet-500"
            actions={
              <div className="flex items-center gap-2">
                {/* Experience Selector */}
                <ExperienceSelector />

                {/* AI Provider Settings */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 rounded-xl">
                      <Settings2 className="size-4" />
                      {canChat ? (
                        <div className="flex items-center gap-1.5">
                          <div className="size-2 rounded-full bg-emerald-500" />
                          <span className="hidden sm:inline">
                            {providersData?.providers.find(p => p.id === selectedProviderId)?.name || 'Ready'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-amber-500">Setup</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3" align="end">
                    {providerSettingsContent}
                  </PopoverContent>
                </Popover>

                {/* History Button */}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsHistoryOpen(true)}
                  className="size-9 rounded-xl"
                >
                  <History className="size-4" />
                </Button>

                {/* New Conversation Button */}
                <Button onClick={handleNewSession} size="sm" className="gap-2 rounded-xl">
                  <Plus className="size-4" />
                  New Chat
                </Button>
              </div>
            }
          />
        </div>

        {/* Main Content - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-6 lg:px-8 py-10">
            {isLoadingProviders ? (
              <div className="text-center py-20">
                <Skeleton className="mx-auto size-16 rounded-2xl" />
                <Skeleton className="mx-auto mt-6 h-8 w-64" />
                <Skeleton className="mx-auto mt-4 h-5 w-96" />
              </div>
            ) : (
              <div className="space-y-8">
                {/* Hero */}
                <div className="text-center space-y-3">
                  <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-violet-500/10 ring-1 ring-violet-500/20">
                    <Bot className="size-7 text-violet-500" />
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    What would you like to know?
                  </h2>
                  <p className="text-muted-foreground max-w-lg mx-auto">
                    Get AI-powered insights about search performance, user behavior, and content gaps.
                  </p>
                </div>

                {/* Processing Status */}
                <ProcessingStatusBanner />

                {/* Setup Warning */}
                {!canChat && (
                  <div className="flex justify-center">
                    <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
                        <AlertCircle className="size-4 text-amber-500" />
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-sm">Configuration Needed</p>
                        <p className="text-xs text-muted-foreground">Configure AI provider above to start</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Suggestions Grid */}
                {canChat && (
                  <div className="grid gap-4 md:grid-cols-3">
                    {SUGGESTED_QUESTIONS.map((category) => {
                      const CategoryIcon = category.icon;
                      return (
                        <div
                          key={category.category}
                          className="flex flex-col rounded-xl border bg-card p-5 shadow-sm"
                        >
                          <div className="flex items-center gap-3 mb-4">
                            <div className={cn('flex size-10 items-center justify-center rounded-xl', category.bgColor)}>
                              <CategoryIcon className={cn('size-5', category.color)} />
                            </div>
                            <span className="font-semibold">{category.category}</span>
                          </div>
                          <div className="space-y-1.5">
                            {category.questions.map((question, index) => (
                              <button
                                key={index}
                                onClick={() => handleSuggestedQuestion(question)}
                                className="group/q flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-all hover:bg-muted"
                              >
                                <span className="text-muted-foreground group-hover/q:text-foreground">{question}</span>
                                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-all group-hover/q:opacity-100" />
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Input Form */}
                <div className="mx-auto max-w-2xl">
                  <form onSubmit={handleFormSubmit} className="flex gap-3">
                    <div className="relative flex-1">
                      <Textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={
                          isLoadingProviders
                            ? "Loading..."
                            : canChat
                              ? "Ask about your analytics..."
                              : "Configure AI provider to start..."
                        }
                        className="min-h-[44px] max-h-[80px] resize-none rounded-xl border border-border bg-background shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 pr-4"
                        onKeyDown={handleKeyDown}
                        disabled={isLoadingProviders || !canChat || isLoading}
                        rows={1}
                      />
                    </div>
                    <Button
                      type="submit"
                      size="icon"
                      className="size-11 shrink-0 rounded-xl bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 shadow-sm hover:shadow-md transition-all disabled:opacity-50"
                      disabled={isLoadingProviders || !input.trim() || !canChat}
                    >
                      <Send className="size-4" />
                    </Button>
                  </form>
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Press Enter to send, Shift+Enter for new line
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* History Sheet */}
        <HistorySheet
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          sessions={sessions}
          isLoading={isLoadingSessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
        />
      </div>
    );
  }

  // Chat mode - full height layout for active conversations
  // Use negative margins to break out of the mainDiv's py-8 padding
  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-8 flex h-[calc(100vh-64px)] flex-col">
      {/* Compact Header for chat mode */}
      <div className="border-b px-6 py-2.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex shrink-0 items-center justify-center rounded-lg bg-violet-500/10 size-8">
              <MessageSquare className="size-4 text-violet-500" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold tracking-tight truncate">
                {currentSessionId ? currentSessionTitle : 'Analytics Chat'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Experience Selector - Compact */}
            <ExperienceSelector compact />

            {/* AI Provider Settings - Compact */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs px-2.5">
                  <Settings2 className="size-3.5" />
                  {canChat ? (
                    <div className="size-1.5 rounded-full bg-emerald-500" />
                  ) : (
                    <span className="text-amber-500 text-[10px]">Setup</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2.5" align="end">
                {providerSettingsContent}
              </PopoverContent>
            </Popover>

            {/* History Button - Compact */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsHistoryOpen(true)}
              className="size-8 rounded-lg"
            >
              <History className="size-3.5" />
            </Button>

            {/* New Conversation Button - Compact */}
            <Button onClick={handleNewSession} size="sm" className="h-8 gap-1.5 rounded-lg text-xs px-2.5">
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">New</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Chat Container */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Messages Area - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-6 py-6">
            <div className="space-y-5">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onFollowUpClick={handleSuggestedQuestion}
                  streamingState={message.isStreaming ? {
                    status: streamStatus,
                    activeTool: activeTool,
                    toolsExecuted: toolsExecuted,
                  } : undefined}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {/* Input Form - Fixed at Bottom */}
        <div className="shrink-0 border-t border-border bg-muted/30">
          <div className="mx-auto max-w-4xl px-6 py-4">
            <form onSubmit={handleFormSubmit} className="flex gap-3">
              {/* Quick Suggestions Button */}
              <Popover open={isSuggestionsOpen} onOpenChange={setIsSuggestionsOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-[44px] shrink-0 rounded-xl border border-dashed border-violet-300 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-900/50 hover:border-violet-400 dark:hover:border-violet-600 transition-colors"
                    disabled={!canChat || isLoading}
                  >
                    <Sparkles className="size-4 text-violet-500" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[400px] p-0 rounded-2xl shadow-xl"
                  align="start"
                  side="top"
                  sideOffset={12}
                >
                  <div className="px-4 py-3 border-b bg-gradient-to-r from-violet-500/10 to-purple-500/10">
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-lg bg-violet-500/20 p-1.5">
                        <Sparkles className="size-4 text-violet-500" />
                      </div>
                      <div>
                        <span className="font-semibold text-sm">Quick Questions</span>
                        <p className="text-xs text-muted-foreground">Click any question to ask it</p>
                      </div>
                    </div>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto p-3 space-y-3">
                    {SUGGESTED_QUESTIONS.map((category) => {
                      const CategoryIcon = category.icon;
                      return (
                        <div key={category.category} className="space-y-1.5">
                          <div className="flex items-center gap-2 px-1">
                            <div className={cn('rounded-lg p-1', category.bgColor)}>
                              <CategoryIcon className={cn('size-3', category.color)} />
                            </div>
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category.category}</span>
                          </div>
                          <div className="space-y-0.5">
                            {category.questions.map((question, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setIsSuggestionsOpen(false);
                                  handleSuggestedQuestion(question);
                                }}
                                className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-muted/80 transition-colors flex items-center gap-2 group"
                              >
                                <span className="flex-1 text-foreground/80 group-hover:text-foreground leading-snug">{question}</span>
                                <ChevronRight className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              <div className="relative flex-1">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    isLoadingProviders
                      ? "Loading..."
                      : canChat
                        ? "Ask about your analytics..."
                        : "Configure AI provider to start..."
                  }
                  className="min-h-[44px] max-h-[100px] resize-none rounded-xl text-sm border border-border bg-background shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 pr-4"
                  onKeyDown={handleKeyDown}
                  disabled={isLoadingProviders || !canChat || isLoading}
                  rows={1}
                />
              </div>
              {isLoading ? (
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="size-[44px] shrink-0 rounded-xl shadow-sm"
                  onClick={stopStreaming}
                >
                  <StopCircle className="size-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  className="size-[44px] shrink-0 rounded-xl bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 shadow-sm hover:shadow-md transition-all disabled:opacity-50"
                  disabled={isLoadingProviders || !input.trim() || !canChat}
                >
                  <Send className="size-4" />
                </Button>
              )}
            </form>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>

      {/* History Sheet */}
      <HistorySheet
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        sessions={sessions}
        isLoading={isLoadingSessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
      />
    </div>
  );
}
