'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useChatExperience, useWidgetConfig, type WidgetConfig } from './use-chat-experience';
import { PresetRenderer } from './preset-renderers';
import { useChatSettings, ChatSettingsModal } from './chat-settings';
import type { ChatExperienceMessage } from './chat.types';
import {
  MessageSquare,
  RotateCcw,
  Loader2,
  Check,
  X,
  Settings,
  Sparkles,
  ArrowUp,
  ShoppingBag,
  Search as SearchIcon,
  Zap,
  Bot,
  Minus,
  GitCompare,
  BarChart3,
  Maximize2,
  Minimize2,
} from 'lucide-react';

// ============================================================================
// Widget size modes
// ============================================================================

type WidgetSize = 'side' | 'center';

/**
 * CSS classes for each widget size. Each entry controls position, width, and height.
 * Mobile (<640px) always goes full-screen regardless of the chosen size.
 */
const WIDGET_SIZE_CLASSES: Record<WidgetSize, string> = {
  // Side widget — anchored bottom-right, good room for presets/grids
  side: [
    'fixed z-50',
    // mobile: full-width overlay
    'bottom-0 right-0 left-0 h-[calc(100vh-4rem)] rounded-none',
    // sm+: side panel
    'sm:bottom-5 sm:right-5 sm:left-auto sm:w-[540px] sm:h-[min(720px,calc(100vh-7rem))] sm:rounded-2xl',
    'lg:w-[600px] lg:h-[min(780px,calc(100vh-6rem))]',
  ].join(' '),

  // Centered panel — ~50% width, vertically centered
  center: [
    'fixed z-50',
    'bottom-0 right-0 left-0 h-[calc(100vh-4rem)] rounded-none',
    'sm:inset-0 sm:m-auto sm:w-[90vw] sm:max-w-3xl sm:h-[min(720px,calc(100vh-8rem))] sm:rounded-2xl',
    'lg:max-w-4xl lg:h-[min(780px,calc(100vh-6rem))]',
  ].join(' '),
};

// ============================================================================
// Markdown-lite renderer
// ============================================================================

function renderMarkdown(text: string) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const cls =
        level === 1
          ? 'text-base font-semibold mt-3 mb-1'
          : level === 2
            ? 'text-sm font-semibold mt-2 mb-1'
            : 'text-sm font-medium mt-2 mb-0.5';
      elements.push(
        <div key={i} className={cls}>
          {inlineMarkdown(headingMatch[2])}
        </div>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      elements.push(
        <div key={i} className="flex gap-2 ml-1">
          <span className="text-muted-foreground/60 select-none">•</span>
          <span>{inlineMarkdown(line.replace(/^[-*]\s+/, ''))}</span>
        </div>,
      );
      continue;
    }

    const olMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      elements.push(
        <div key={i} className="flex gap-2 ml-1">
          <span className="text-muted-foreground/60 select-none min-w-[1.2em] text-right">
            {olMatch[1]}.
          </span>
          <span>{inlineMarkdown(olMatch[2])}</span>
        </div>,
      );
      continue;
    }

    if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />);
      continue;
    }

    elements.push(
      <div key={i}>{inlineMarkdown(line)}</div>,
    );
  }

  return <div className="space-y-0.5 leading-relaxed">{elements}</div>;
}

/** Process bold (**text**) within a plain text string */
function processBold(text: string, keyPrefix: string): React.ReactNode {
  if (!/\*\*.+?\*\*/.test(text)) return text;
  const segments = text.split(/(\*\*.+?\*\*)/g);
  return (
    <>
      {segments.map((seg, j) =>
        seg.startsWith('**') && seg.endsWith('**') ? (
          <strong key={`${keyPrefix}-b${j}`} className="font-semibold">{seg.slice(2, -2)}</strong>
        ) : (
          <span key={`${keyPrefix}-t${j}`}>{seg}</span>
        ),
      )}
    </>
  );
}

function inlineMarkdown(text: string): React.ReactNode {
  // Split on code spans first
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="px-1 py-0.5 rounded bg-muted text-[13px] font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Process markdown links [text](url) and bold within the remaining text
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    if (!linkRegex.test(part)) {
      return <span key={i}>{processBold(part, String(i))}</span>;
    }

    // Reset regex after test
    linkRegex.lastIndex = 0;
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(part)) !== null) {
      // Text before the link
      if (match.index > lastIndex) {
        nodes.push(<span key={`${i}-pre${lastIndex}`}>{processBold(part.slice(lastIndex, match.index), `${i}-pre${lastIndex}`)}</span>);
      }
      // The link itself
      nodes.push(
        <a
          key={`${i}-link${match.index}`}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 decoration-foreground/40 hover:decoration-foreground transition-colors"
        >
          {match[1]}
        </a>,
      );
      lastIndex = match.index + match[0].length;
    }

    // Text after the last link
    if (lastIndex < part.length) {
      nodes.push(<span key={`${i}-post${lastIndex}`}>{processBold(part.slice(lastIndex), `${i}-post${lastIndex}`)}</span>);
    }

    return <span key={i}>{nodes}</span>;
  });
}

// ============================================================================
// Animated word cycling per pipeline step
// ============================================================================

/** Each step has a set of words that cycle with a crossfade animation */
const STEP_ROTATING_WORDS: Record<string, string[]> = {
  'Loading context':   ['Thinking', 'Analyzing', 'Reading', 'Processing'],
  'Planning actions':  ['Planning', 'Reasoning', 'Strategizing', 'Mapping out'],
  'Executing actions': ['Searching', 'Fetching', 'Querying', 'Scanning'],
  'Generating response': ['Writing', 'Composing', 'Crafting', 'Generating'],
};

const DEFAULT_ROTATING_WORDS = ['Thinking', 'Processing', 'Analyzing', 'Working'];

function friendlyToolName(name: string): string {
  return name
    .replace(/\s+(Azure|Search|Index|API|Service|Tool|Query|Lookup)\s*/gi, ' ')
    .replace(/\s+Search$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ============================================================================
// Animated thinking / progress indicator
// ============================================================================

/** Cycling word display — crossfades between words in a list */
function RotatingWords({ words, intervalMs = 2000 }: { words: string[]; intervalMs?: number }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % words.length);
        setVisible(true);
      }, 250); // brief gap for crossfade
    }, intervalMs);
    return () => clearInterval(timer);
  }, [words.length, intervalMs]);

  return (
    <span
      className="inline-block transition-all duration-300 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-4px)',
        minWidth: '5em',
      }}
    >
      {words[index]}
    </span>
  );
}

/** Three bouncing dots — minimal typing indicator */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1 px-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary/70"
          style={{
            animation: 'typing-bounce 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Shimmer bar that flows left-to-right — used during search / tool execution */
function ShimmerBar() {
  return (
    <div className="w-full h-0.5 rounded-full bg-primary/10 overflow-hidden">
      <div
        className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary/60 to-transparent"
        style={{ animation: 'shimmer 1.5s ease-in-out infinite' }}
      />
    </div>
  );
}

/**
 * Pipeline streaming status — animated card that shows the current phase
 * with rotating words and live tool status.
 */
function StreamingStatus({ stepName, toolCalls }: {
  stepName?: string;
  toolCalls?: NonNullable<ChatExperienceMessage['toolCalls']>;
}) {
  const completed = toolCalls?.filter((tc) => tc.status === 'completed') ?? [];
  const failed = toolCalls?.filter((tc) => tc.status === 'failed') ?? [];
  const hasToolActivity = (toolCalls?.length ?? 0) > 0;

  const words = stepName
    ? (STEP_ROTATING_WORDS[stepName] ?? DEFAULT_ROTATING_WORDS)
    : DEFAULT_ROTATING_WORDS;

  return (
    <div className="rounded-xl border border-border/50 bg-muted/30 p-3 space-y-2.5 animate-fade-in">
      {/* Current phase with rotating words */}
      <div className="flex items-center gap-2.5">
        <TypingDots />
        <span className="text-xs font-medium text-foreground/80">
          <RotatingWords words={words} />
          <span className="text-muted-foreground/50">...</span>
        </span>
      </div>

      {/* Shimmer progress bar */}
      {hasToolActivity && <ShimmerBar />}

      {/* Completed tool calls — shown inline as they finish */}
      {completed.length > 0 && (
        <div className="space-y-1 pl-[30px]">
          {completed.map((tc) => (
            <div
              key={tc.id}
              className="flex items-center gap-2 text-xs animate-fade-in"
            >
              <div className="w-4 h-4 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-muted-foreground">
                {friendlyToolName(tc.name)}
              </span>
              {tc.durationMs != null && (
                <span className="text-muted-foreground/50">{(tc.durationMs / 1000).toFixed(1)}s</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Failed calls */}
      {failed.map((tc) => (
        <div
          key={tc.id}
          className="flex items-center gap-2 text-xs pl-[30px] animate-fade-in"
        >
          <div className="w-4 h-4 rounded-full bg-red-500/15 flex items-center justify-center">
            <X className="w-2.5 h-2.5 text-red-500" />
          </div>
          <span className="text-red-600 dark:text-red-400">{friendlyToolName(tc.name)} failed</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Settled tool summary — shown AFTER streaming ends to preserve
 * a compact record of what tools ran (replaces the streaming card).
 */
function SettledToolSummary({
  toolCalls,
}: {
  toolCalls: NonNullable<ChatExperienceMessage['toolCalls']>;
}) {
  const completed = toolCalls.filter((tc) => tc.status === 'completed');
  const failed = toolCalls.filter((tc) => tc.status === 'failed');

  if (completed.length === 0 && failed.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
      {completed.map((tc) => (
        <span
          key={tc.id}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Check className="w-3 h-3 text-emerald-500" />
          <span>{friendlyToolName(tc.name)}</span>
          {tc.durationMs != null && (
            <span className="text-muted-foreground/50">{(tc.durationMs / 1000).toFixed(1)}s</span>
          )}
        </span>
      ))}
      {failed.map((tc) => (
        <span
          key={tc.id}
          className="inline-flex items-center gap-1.5 text-xs text-red-500/80"
        >
          <X className="w-3 h-3" />
          <span>{friendlyToolName(tc.name)} failed</span>
        </span>
      ))}
    </div>
  );
}

// ============================================================================
// Message Bubble
// ============================================================================

function MessageBubble({ message }: { message: ChatExperienceMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-md">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 animate-fade-in">
      <div className="shrink-0 mt-0.5">
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        {/* While streaming with pipeline activity: rich status card */}
        {message.isStreaming && !message.content && (message.pipelineStep || (message.toolCalls && message.toolCalls.length > 0)) && (
          <StreamingStatus
            stepName={message.pipelineStep}
            toolCalls={message.toolCalls}
          />
        )}

        {/* While streaming with NO pipeline info and no content yet: typing dots */}
        {message.isStreaming && !message.content && !message.pipelineStep && !(message.toolCalls && message.toolCalls.length > 0) && (
          <div className="flex items-center gap-2 py-1 animate-fade-in">
            <TypingDots />
            <span className="text-xs text-muted-foreground/60">
              <RotatingWords words={DEFAULT_ROTATING_WORDS} />
              <span className="text-muted-foreground/40">...</span>
            </span>
          </div>
        )}

        {/* After streaming ends: compact settled tool summary */}
        {!message.isStreaming && message.toolCalls && message.toolCalls.length > 0 && (
          <SettledToolSummary toolCalls={message.toolCalls} />
        )}

        {/* Text content */}
        {message.content && (
          <div className="text-sm text-foreground">
            {renderMarkdown(message.content)}
            {message.isStreaming && message.content && (
              <span className="inline-block w-0.5 h-4 bg-foreground/50 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </div>
        )}

        {/* Preset (only show after content arrives or streaming ends) */}
        {message.presetPayload && message.preset &&
         (message.content || !message.isStreaming) && (
          <PresetRenderer
            preset={message.preset}
            items={message.presetPayload.items}
            displayConfig={message.presetPayload.displayConfig}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Suggestion Chips
// ============================================================================

const DEFAULT_SUGGESTIONS = [
  'Show me winter jackets',
  'Find running shoes under $100',
  'What\'s trending right now?',
];

const SUGGESTION_ICONS = [ShoppingBag, SearchIcon, Zap, Sparkles, Bot];

function SuggestionChips({ onSelect, questions }: { onSelect: (text: string) => void; questions?: string[] }) {
  const items = questions && questions.length > 0 ? questions : DEFAULT_SUGGESTIONS;
  return (
    <div className="flex flex-wrap justify-center gap-2 mt-5">
      {items.map((text, i) => {
        const Icon = SUGGESTION_ICONS[i % SUGGESTION_ICONS.length];
        return (
          <button
            key={text}
            onClick={() => onSelect(text)}
            className="group flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-muted/50 text-sm text-muted-foreground hover:text-foreground hover:border-primary dark:hover:border-primary/40 hover:bg-primary/5 dark:hover:bg-primary/5 transition-all duration-200 cursor-pointer"
          >
            <Icon className="w-3.5 h-3.5 text-primary/70 group-hover:text-primary transition-colors" />
            {text}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Empty State (rich, visual)
// ============================================================================

function EmptyState({ onSuggestion, widgetConfig }: { onSuggestion: (text: string) => void; widgetConfig?: WidgetConfig | null }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        {/* Animated icon */}
        <div className="relative w-16 h-16 mx-auto mb-5">
          <div className="absolute inset-0 rounded-2xl bg-primary/20 animate-pulse" />
          <div className="relative w-full h-full rounded-2xl bg-primary flex items-center justify-center shadow-lg">
            <Bot className="w-8 h-8 text-primary-foreground" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-foreground mb-2">
          {widgetConfig?.greeting || 'How can I help you today?'}
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {widgetConfig?.description || 'I can search products, compare options, find deals, and answer questions about our catalog.'}
        </p>

        <SuggestionChips onSelect={onSuggestion} questions={widgetConfig?.suggestedQuestions} />
      </div>
    </div>
  );
}

// ============================================================================
// Configuration Screen
// ============================================================================

function ConfigurationScreen({
  settings,
  onSave,
}: {
  settings: import('./chat-settings').ChatSettings;
  onSave: (patch: Partial<import('./chat-settings').ChatSettings>) => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-sm px-6">
        <div className="relative w-16 h-16 mx-auto mb-5">
          <div className="absolute inset-0 rounded-2xl bg-primary/20 animate-pulse" />
          <div className="relative w-full h-full rounded-2xl bg-primary flex items-center justify-center shadow-lg">
            <MessageSquare className="w-8 h-8 text-primary-foreground" />
          </div>
        </div>
        <h2 className="text-xl font-bold mb-2">Configure Chat</h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Connect to an AI experience to start chatting.
        </p>
        <ChatSettingsModal
          settings={settings}
          onSave={onSave}
          trigger={
            <Button className="cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl px-6 shadow-md transition-all">
              <Settings className="w-4 h-4 mr-2" />
              Configure Connection
            </Button>
          }
        />
      </div>
    </div>
  );
}

// ============================================================================
// Chat Interface
// ============================================================================

function ChatInterface({
  settings,
  onSave,
  onMinimize,
  widgetSize,
  onSizeChange,
}: {
  settings: import('./chat-settings').ChatSettings;
  onSave: (patch: Partial<import('./chat-settings').ChatSettings>) => void;
  onMinimize?: () => void;
  widgetSize?: WidgetSize;
  onSizeChange?: (size: WidgetSize) => void;
}) {
  const { messages, sendMessage, isStreaming, error, clearSession } =
    useChatExperience({
      accessToken: settings.accessToken,
      apiUrl: settings.apiUrl,
    });

  const { config: widgetConfig } = useWidgetConfig({
    accessToken: settings.accessToken,
    apiUrl: settings.apiUrl,
  });

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const adjustTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, []);

  const handleSend = useCallback((text?: string) => {
    const value = text ?? input;
    if (!value.trim() || isStreaming) return;
    sendMessage(value);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Widget header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <span className="text-sm font-semibold text-foreground">{widgetConfig?.name || 'AI Assistant'}</span>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-muted-foreground">Online</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <ChatSettingsModal settings={settings} onSave={onSave} />
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSession}
            className="text-muted-foreground hover:text-foreground gap-1.5 h-8 text-xs rounded-lg"
          >
            <RotateCcw className="w-3 h-3" />
            New
          </Button>

          {/* Size toggle — hidden on mobile since mobile is always full-screen */}
          {onSizeChange && widgetSize && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onSizeChange(widgetSize === 'side' ? 'center' : 'side')}
              className="hidden sm:inline-flex h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
              title={widgetSize === 'side' ? 'Expand to center' : 'Dock to side'}
            >
              {widgetSize === 'side' ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </Button>
          )}

          {onMinimize && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onMinimize}
              className="text-muted-foreground hover:text-foreground h-7 w-7 rounded-md ml-0.5"
              title="Minimize"
            >
              <Minus className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-xs flex items-center gap-2">
          <X className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Messages area */}
      {messages.length === 0 ? (
        <EmptyState onSuggestion={(text) => handleSend(text)} widgetConfig={widgetConfig} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-5 space-y-5">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="px-4 pb-4 pt-2 border-t border-border bg-card">
        <div>
          <div className="relative flex items-end rounded-2xl border border-border bg-muted/50 shadow-sm focus-within:shadow-md focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-ring/20 transition-all duration-200">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                adjustTextarea();
              }}
              onKeyDown={handleKeyDown}
              placeholder={widgetConfig?.placeholder || 'Ask anything...'}
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50 min-h-[44px] max-h-[160px]"
            />
            <div className="p-1.5">
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim() || isStreaming}
                size="icon"
                className="h-8 w-8 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-30 disabled:bg-muted-foreground/20 shrink-0 transition-all shadow-sm"
              >
                {isStreaming ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ArrowUp className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>
          <p className="text-center text-[11px] text-muted-foreground/50 mt-2">
            Powered by Interakt AI
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Landing Showcase (background behind the floating widget)
// ============================================================================

const SHOWCASE_FEATURES = [
  { icon: SearchIcon, label: 'Smart Search', desc: 'Natural language product discovery' },
  { icon: GitCompare, label: 'Compare', desc: 'Side-by-side product comparison' },
  { icon: BarChart3, label: 'Insights', desc: 'Personalized recommendations' },
];

function LandingShowcase() {
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 text-center select-none">
      {/* Hero */}
      <div className="relative w-14 h-14 mb-5 animate-fade-in">
        <div className="absolute inset-0 rounded-2xl bg-primary/20 animate-pulse" />
        <div className="relative w-full h-full rounded-2xl bg-primary flex items-center justify-center shadow-lg">
          <Bot className="w-7 h-7 text-primary-foreground" />
        </div>
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 animate-fade-in" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
        AI-Powered Chat Experience
      </h1>
      <p className="text-muted-foreground text-sm sm:text-base max-w-md leading-relaxed mb-8 animate-fade-in" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
        See how intelligent search and conversational AI work together.
        Try the live demo in the chat widget.
      </p>

      {/* Feature pills */}
      <div className="flex flex-wrap justify-center gap-3 mb-10 animate-fade-in" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
        {SHOWCASE_FEATURES.map((f) => (
          <div
            key={f.label}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-border bg-card shadow-sm"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <f.icon className="w-4 h-4 text-primary" />
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold text-foreground">{f.label}</div>
              <div className="text-[11px] text-muted-foreground">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Hint arrow */}
      <div className="text-muted-foreground text-xs flex items-center gap-2 animate-fade-in" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
        <span>Try the chat widget</span>
        <span className="text-lg">&#8600;</span>
      </div>
    </div>
  );
}

// ============================================================================
// Chat Bubble FAB
// ============================================================================

function ChatBubbleFAB({ onClick, hasMessages }: { onClick: () => void; hasMessages?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:flex items-center justify-center transition-all cursor-pointer"
      style={{ animation: 'fab-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards, pulse-ring 2s ease-out 1s infinite' }}
    >
      <MessageSquare className="w-6 h-6" />
      {hasMessages && (
        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-border" />
      )}
    </button>
  );
}

// ============================================================================
// Page — Floating widget layout
// ============================================================================

export default function ChatPage() {
  const { settings, updateSettings, isConfigured, isHydrated } = useChatSettings();
  const [isOpen, setIsOpen] = useState(true);
  const [widgetSize, setWidgetSize] = useState<WidgetSize>('side');

  if (!isHydrated) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-4rem)] bg-background overflow-hidden">
      {/* Background — subtle grid + gradient accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Dot grid pattern */}
        <div className="absolute inset-0 opacity-[0.4] dark:opacity-[0.15]" style={{ backgroundImage: 'radial-gradient(circle, var(--muted-foreground) 0.75px, transparent 0.75px)', backgroundSize: '24px 24px' }} />
        {/* Gradient blobs */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      </div>

      {/* Landing showcase background */}
      <div className="relative z-0 h-full">
        <LandingShowcase />
      </div>

      {/* Floating chat widget */}
      {isOpen ? (
        <div
          key={widgetSize}
          className={`${WIDGET_SIZE_CLASSES[widgetSize]} flex flex-col bg-card border border-border shadow-2xl shadow-black/15 dark:shadow-black/40 overflow-hidden transition-all duration-300 ease-out`}
          style={{ animation: 'widget-expand 0.3s ease-out forwards' }}
        >
          {!isConfigured ? (
            <ConfigurationScreen settings={settings} onSave={updateSettings} />
          ) : (
            <ChatInterface
              settings={settings}
              onSave={updateSettings}
              onMinimize={() => setIsOpen(false)}
              widgetSize={widgetSize}
              onSizeChange={setWidgetSize}
            />
          )}
        </div>
      ) : (
        <ChatBubbleFAB onClick={() => setIsOpen(true)} hasMessages={isConfigured} />
      )}
    </div>
  );
}
