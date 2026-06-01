// app/playground/ai-service/_components/ChatPanel.tsx

'use client';

/**
 * Chat Panel
 *
 * Modern chat interface with proper scrolling and streaming support.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Send,
  Loader2,
  User,
  Bot,
  Trash2,
  StopCircle,
  Zap,
  Settings2,
  Sparkles,
  SlidersHorizontal,
  MessageSquareText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStreamingChat, useChat } from '../_lib/hooks/useAIPlayground';
import { UsageStats } from './UsageStats';
import { Markdown } from '@/shared/ui/custom/markdown';
import type { ChatMessage } from '../_lib/api-client';

interface ChatPanelProps {
  providerId: string | null;
  modelId: number | null;
  temperature: number;
  maxTokens: number;
  topP: number;
  systemPrompt: string;
  onTemperatureChange: (value: number) => void;
  onMaxTokensChange: (value: number) => void;
  onSystemPromptChange: (value: string) => void;
}

export function ChatPanel({
  providerId,
  modelId,
  temperature,
  maxTokens,
  topP,
  systemPrompt,
  onTemperatureChange,
  onMaxTokensChange,
  onSystemPromptChange,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [useStreaming, setUseStreaming] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Streaming chat hook
  const streamingChat = useStreamingChat();

  // Non-streaming chat hook
  const regularChat = useChat();

  // Use the appropriate hook based on streaming toggle
  const activeChat = useStreaming ? streamingChat : regularChat;
  const messages = activeChat.messages;
  const isProcessing = useStreaming ? streamingChat.isStreaming : regularChat.isLoading;
  const currentResponse = useStreaming ? streamingChat.currentResponse : '';

  // Set system prompt when it changes
  useEffect(() => {
    if (systemPrompt) {
      activeChat.setSystemPrompt(systemPrompt);
    }
  }, [systemPrompt, useStreaming]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentResponse]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !providerId || !modelId || isProcessing) return;

    const message = input.trim();
    setInput('');

    if (useStreaming) {
      await streamingChat.sendMessage(message, {
        providerId,
        modelId,
        temperature,
        maxTokens,
        topP,
      });
    } else {
      await regularChat.sendMessage(message, {
        providerId,
        modelId,
        temperature,
        maxTokens,
        topP,
      });
    }

    inputRef.current?.focus();
  }, [input, providerId, modelId, temperature, maxTokens, topP, isProcessing, useStreaming]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleClear = useCallback(() => {
    streamingChat.clearMessages();
    regularChat.clearMessages();
    setInput('');
  }, []);

  const canSend = input.trim().length > 0 && providerId && modelId && !isProcessing;
  const displayMessages = messages.filter(m => m.role !== 'system');
  const usage = useStreaming ? streamingChat.usage : regularChat.lastResponse?.usage;
  const metadata = useStreaming ? streamingChat.metadata : regularChat.lastResponse?.metadata;

  return (
    <div className="h-full flex flex-col">
      {/* Messages Area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
      >
        <div className="max-w-3xl mx-auto px-4 py-6">
          {displayMessages.length === 0 && !currentResponse ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 mb-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-2">Start a conversation</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Type a message below to begin chatting with the AI assistant.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {displayMessages.map((message, index) => (
                <MessageBubble key={index} message={message} />
              ))}

              {/* Streaming response */}
              {currentResponse && (
                <MessageBubble
                  message={{ role: 'assistant', content: currentResponse }}
                  isStreaming
                />
              )}

              {/* Loading indicator for non-streaming */}
              {isProcessing && !useStreaming && (
                <div className="flex gap-4">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="inline-block bg-muted rounded-2xl rounded-tl-md px-4 py-3">
                    <TypingIndicator />
                  </div>
                </div>
              )}

              {/* Loading indicator for streaming before first chunk */}
              {isProcessing && useStreaming && !currentResponse && (
                <div className="flex gap-4">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="inline-block bg-muted rounded-2xl rounded-tl-md px-4 py-3">
                    <TypingIndicator />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Usage Stats */}
      {usage && metadata && (
        <div className="shrink-0 border-t bg-muted/30 px-4 py-2">
          <div className="max-w-3xl mx-auto">
            <UsageStats
              usage={usage}
              metadata={{
                requestId: metadata.requestId,
                provider: metadata.provider,
                model: metadata.model,
                durationMs: metadata.durationMs || 0,
              }}
              compact
            />
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="shrink-0 border-t bg-background p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-3">
            {/* Settings Popover */}
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(
                    "shrink-0 h-11 w-11 transition-colors",
                    settingsOpen && "bg-muted"
                  )}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                className="w-80 p-0"
                sideOffset={8}
              >
                <Tabs defaultValue="general" className="w-full">
                  <div className="border-b px-3 pt-3 pb-0">
                    <TabsList className="w-full h-9 bg-muted/50">
                      <TabsTrigger value="general" className="flex-1 gap-1.5 text-xs">
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        General
                      </TabsTrigger>
                      <TabsTrigger value="system" className="flex-1 gap-1.5 text-xs">
                        <MessageSquareText className="h-3.5 w-3.5" />
                        System
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="general" className="p-4 space-y-4 mt-0">
                    {/* Streaming Toggle */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Streaming</Label>
                        <p className="text-xs text-muted-foreground">
                          See responses as they generate
                        </p>
                      </div>
                      <Switch
                        checked={useStreaming}
                        onCheckedChange={setUseStreaming}
                        disabled={isProcessing}
                      />
                    </div>

                    <div className="h-px bg-border" />

                    {/* Temperature */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Temperature</Label>
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {temperature.toFixed(1)}
                        </span>
                      </div>
                      <Slider
                        min={0}
                        max={2}
                        step={0.1}
                        value={[temperature]}
                        onValueChange={([v]) => onTemperatureChange(v)}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Lower = focused, Higher = creative
                      </p>
                    </div>

                    <div className="h-px bg-border" />

                    {/* Max Tokens */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Max Tokens</Label>
                      <Input
                        type="number"
                        min={1}
                        max={128000}
                        value={maxTokens}
                        onChange={(e) => onMaxTokensChange(parseInt(e.target.value, 10) || 1024)}
                        className="h-8 font-mono text-sm"
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="system" className="p-4 space-y-3 mt-0">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">System Prompt</Label>
                      <p className="text-xs text-muted-foreground">
                        Define how the AI should behave
                      </p>
                    </div>
                    <Textarea
                      placeholder="You are a helpful assistant..."
                      value={systemPrompt}
                      onChange={(e) => onSystemPromptChange(e.target.value)}
                      className="min-h-[120px] resize-none text-sm"
                    />
                  </TabsContent>
                </Tabs>

                {/* Footer */}
                <div className="border-t p-3 bg-muted/30">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 h-8"
                    onClick={() => {
                      handleClear();
                      setSettingsOpen(false);
                    }}
                    disabled={isProcessing || displayMessages.length === 0}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear Conversation
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Input */}
            <div className="flex-1 relative">
              <Textarea
                ref={inputRef}
                placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isProcessing}
                className="min-h-[44px] max-h-[200px] pr-12 resize-none py-3"
                rows={1}
              />
              <div className="absolute right-2 bottom-2">
                {isProcessing && useStreaming ? (
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-8 w-8"
                    onClick={() => streamingChat.stopStreaming()}
                  >
                    <StopCircle className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleSend}
                    disabled={!canSend}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between mt-2 px-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {useStreaming && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Zap className="h-3 w-3" />
                  Streaming
                </Badge>
              )}
              {displayMessages.length > 0 && (
                <span>{displayMessages.length} messages</span>
              )}
            </div>
            {displayMessages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={handleClear}
                disabled={isProcessing}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Message Bubble Component
// ============================================================================

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-4', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div className={cn(
        'shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
        isUser
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted'
      )}>
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      {/* Message */}
      <div className={cn(
        'flex-1 min-w-0',
        isUser && 'flex justify-end'
      )}>
        <div className={cn(
          'inline-block max-w-[85%] rounded-2xl px-4 py-3',
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-md'
            : 'bg-muted rounded-tl-md'
        )}>
          {isUser ? (
            // User messages: plain text
            <p className="text-sm whitespace-pre-wrap leading-relaxed break-words">
              {message.content}
            </p>
          ) : (
            // Assistant messages: render markdown
            <div className="text-sm leading-relaxed break-words">
              <Markdown>{message.content}</Markdown>
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-current ml-1 animate-pulse rounded-sm" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Typing Indicator Component
// ============================================================================

/**
 * Animated three-dot typing indicator
 */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1">
      <span className="sr-only">AI is thinking...</span>
      <span
        className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce"
        style={{ animationDelay: '0ms', animationDuration: '600ms' }}
      />
      <span
        className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce"
        style={{ animationDelay: '150ms', animationDuration: '600ms' }}
      />
      <span
        className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce"
        style={{ animationDelay: '300ms', animationDuration: '600ms' }}
      />
    </div>
  );
}
