// app/analytics/chat/page.tsx

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/shared/ui/components/button';
import { Textarea } from '@/shared/ui/components/textarea';
import { Skeleton } from '@/shared/ui/components/skeleton';
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
  Sparkles,
  Settings2,
  Cpu,
  Zap,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  StopCircle,
  Plus,
  History,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageBubble } from './_components/MessageBubble';
import Link from 'next/link';
import { ChatHistoryList } from '../_components/shell/ChatHistoryList';
import { useAnalyticsChat } from '../_lib/hooks/useAnalyticsChat';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { ExperienceSelector } from '../_components/ExperienceSelector';
import { PeriodPicker } from '../_components/PeriodPicker';
import { useAnalyticsContext } from '../_lib/AnalyticsContext';

// ============================================================================
// TYPES
// ============================================================================


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


// ============================================================================
// BACK LINK
// ============================================================================

/** The chat full screen is a view of the Ask chat, not a section; this leads back to the sections */
function BackToAnalytics() {
  return (
    <div className="shrink-0 px-6 pt-3">
      <Link
        href="/analytics/overview"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden /> Back to analytics
      </Link>
    </div>
  );
}

// ============================================================================
// SUGGESTED QUESTIONS
// ============================================================================

const SUGGESTED_QUESTIONS = [
  {
    category: 'What to fix',
    icon: Zap,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/15',
    questions: [
      'What needs attention right now?',
      'Which conversations failed, and why?',
      'Which experience is doing worst?',
    ],
  },
  {
    category: 'Search',
    icon: Cpu,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/15',
    questions: [
      'Which searches most often find nothing?',
      'What are people searching for most?',
      'Is search getting slower?',
    ],
  },
  {
    category: 'Changes and cost',
    icon: MessageSquare,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/15',
    questions: [
      'What changed compared with the previous period?',
      'How much did AI cost, and what used it most?',
      'What are customers asking the assistant about?',
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


// ============================================================================
// COMPONENTS
// ============================================================================


interface HistorySheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleted: (sessionId: string) => void;
}

function HistorySheet({ isOpen, onClose, currentSessionId, onSelectSession, onDeleted }: HistorySheetProps) {
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
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-lg">
              <X className="size-4" />
            </Button>
          </div>

          {/* Mounted only while open, so history loads when first asked for */}
          {isOpen && (
            <ChatHistoryList
              currentSessionId={currentSessionId}
              onOpen={(id) => {
                onSelectSession(id);
                onClose();
              }}
              onDeleted={onDeleted}
              autoFocus
              listClassName="max-h-[50vh]"
            />
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AnalyticsChatPage() {
  const { experienceId, experienceName, periodLabel } = useAnalyticsContext();
  const [input, setInput] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: providersData, isLoading: isLoadingProviders } = useAIProviders();
  const chat = useAnalyticsChat({ providerId: selectedProviderId, modelId: selectedModelId });
  const {
    messages,
    isLoading,
    streamStatus,
    activeTool,
    toolsExecuted,
    sessionId: currentSessionId,
    session: sessionData,
    scopeNotice,
    openSession,
  } = chat;

  // Open a conversation named in the URL (?session=…), e.g. from the Ask panel
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('session');
    if (id) openSession(id);
  }, [openSession]);

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


  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = useCallback(async (messageContent?: string) => {
    const content = messageContent || input.trim();
    if (!content || isLoading) return;
    setInput('');
    await chat.send(content);
  }, [input, isLoading, chat]);

  const handleSuggestedQuestion = useCallback((question: string) => {
    handleSubmit(question);
  }, [handleSubmit]);

  const handleNewSession = chat.startNew;
  const handleDeletedSession = (id: string) => {
    if (id === currentSessionId) chat.startNew();
  };
  const handleSelectSession = chat.openSession;
  const stopStreaming = chat.stop;

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
  const scopeRangeLabel = periodLabel;

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
        <BackToAnalytics />
        {/* Header */}
        <div className="border-b p-6 pt-3">
          <PageHeader
            variant="hero"
            title="Ask about your analytics"
            description="The Ask chat, full screen. Same conversations as the Ask panel on every analytics page."
            icon={MessageSquare}
            iconBg="bg-violet-500/10"
            iconColor="text-violet-500"
            actions={
              <div className="flex items-center gap-2">
                {/* Experience Selector */}
                <ExperienceSelector />
                <PeriodPicker />

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
            {scopeNotice && (
              <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                {scopeNotice}
              </div>
            )}
            <p className="mb-6 text-sm text-muted-foreground">
              Answers cover <span className="font-medium text-foreground">{experienceId ? experienceName : 'all experiences'}</span>
              {' '}for <span className="font-medium text-foreground">{scopeRangeLabel.toLowerCase()}</span> unless your question names a different period.
            </p>
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
                    Ask about searches, conversations, failures and cost. Answers show the data they used and the period it covers.
                  </p>
                </div>

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
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onDeleted={handleDeletedSession}
        />
      </div>
    );
  }

  // Chat mode - full height layout for active conversations
  // Use negative margins to break out of the mainDiv's py-8 padding
  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-8 flex h-[calc(100vh-64px)] flex-col">
      <BackToAnalytics />
      {/* Compact Header for chat mode */}
      <div className="border-b px-6 py-2.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex shrink-0 items-center justify-center rounded-lg bg-violet-500/10 size-8">
              <MessageSquare className="size-4 text-violet-500" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold tracking-tight truncate">
                {currentSessionId ? currentSessionTitle : 'Ask about your analytics'}
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {experienceId ? experienceName : 'All experiences'} · {scopeRangeLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Experience Selector - Compact */}
            <ExperienceSelector compact />
            <PeriodPicker compact />

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
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onDeleted={handleDeletedSession}
      />
    </div>
  );
}
