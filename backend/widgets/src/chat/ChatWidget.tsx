import { render } from 'preact';
import { signal, useSignal, useComputed } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

import type {
  ChatConfig,
  ChatStreamEvent,
  PresetPayload,
  WidgetConfigResponse,
} from '../shared/types';
import { createShadowHost } from '../shared/shadow-host';
import { resolveTheme } from '../shared/theme';
import {
  resolveApiBase,
  fetchWidgetConfig,
  streamChat,
  ApiError,
} from '../shared/api-client';
import { PresetRenderer } from './PresetRenderer';
import widgetCss from '../styles/widget.css?raw';

interface Source {
  id: string;
  title?: string;
  dataSource?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  sources?: Source[];
  /** Name of the preset the backend asked us to render (e.g. 'item_grid'). */
  preset?: string;
  /** Items + display config for the preset. */
  presetPayload?: PresetPayload;
  /** For error messages only — the user query that failed, so Retry can re-send it. */
  originalQuery?: string;
}

interface InitializedWidget {
  destroy: () => void;
  setOpen: (next: boolean) => void;
}

const instances = new Map<string, InitializedWidget>();

export const ChatDropinUI = {
  init(config: ChatConfig): void {
    if (!config?.containerId) throw new Error('[Interakt] containerId is required');
    if (!config?.accessToken) throw new Error('[Interakt] accessToken is required');

    // If there's already a widget in this container, destroy it first.
    instances.get(config.containerId)?.destroy();

    const host = createShadowHost(config.containerId, widgetCss);
    const apiBaseUrl = resolveApiBase(config.apiBaseUrl);

    // Seed configuration immediately; enrich with server-side widget-config asynchronously.
    const serverConfig = signal<WidgetConfigResponse | null>(null);
    // 'inline' and 'button' launch states: inline is always open; button starts
    // closed and waits for an explicit window.ChatDropinUI.open() call.
    const open = signal<boolean>(config.launcher === 'inline');

    fetchWidgetConfig(apiBaseUrl, config.accessToken)
      .then((cfg) => {
        serverConfig.value = cfg;
      })
      .catch((err) => {
        console.warn(
          '[Interakt] Could not load widget config, using defaults.',
          err instanceof Error ? err.message : err,
        );
        serverConfig.value = {};
      });

    render(
      <ChatApp
        config={config}
        apiBaseUrl={apiBaseUrl}
        serverConfig={serverConfig}
        open={open}
        onThemeResolved={(vars) => host.applyCssVars(vars)}
      />,
      host.mount,
    );

    const instance: InitializedWidget = {
      destroy() {
        render(null, host.mount);
        host.destroy();
        instances.delete(config.containerId);
      },
      setOpen(next) {
        open.value = next;
      },
    };
    instances.set(config.containerId, instance);
  },

  destroy(containerId?: string): void {
    if (containerId) {
      instances.get(containerId)?.destroy();
      return;
    }
    instances.forEach((inst) => inst.destroy());
    instances.clear();
  },

  /**
   * Programmatically open the chat panel. Primarily useful with
   * `launcher: 'button'`, where the widget renders no trigger and the host
   * wires its own element up to this method.
   *
   * If containerId is omitted, opens every initialized widget.
   */
  open(containerId?: string): void {
    if (containerId) {
      instances.get(containerId)?.setOpen(true);
      return;
    }
    instances.forEach((inst) => inst.setOpen(true));
  },

  /** Programmatically close the chat panel. Symmetric with open(). */
  close(containerId?: string): void {
    if (containerId) {
      instances.get(containerId)?.setOpen(false);
      return;
    }
    instances.forEach((inst) => inst.setOpen(false));
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Session persistence — keep sessionId across page reloads so server-side
// conversation context survives. Keyed by the last 8 chars of the access
// token so multiple widgets on the same page don't collide.
// ─────────────────────────────────────────────────────────────────────────────

function sessionKey(accessToken: string): string {
  return `interakt:chat:session:${accessToken.slice(-8)}`;
}

function readStoredSession(key: string): string | undefined {
  try {
    return sessionStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStoredSession(key: string, id: string | undefined): void {
  try {
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
  } catch {
    /* Storage may be unavailable (private mode, quota) — carry on. */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatApp — the floating/inline panel
// ─────────────────────────────────────────────────────────────────────────────

interface ChatAppProps {
  config: ChatConfig;
  apiBaseUrl: string;
  serverConfig: ReturnType<typeof signal<WidgetConfigResponse | null>>;
  open: ReturnType<typeof signal<boolean>>;
  onThemeResolved: (vars: Record<string, string | undefined>) => void;
}

function ChatApp({
  config,
  apiBaseUrl,
  serverConfig,
  open,
  onThemeResolved,
}: ChatAppProps) {
  const isInline = config.launcher === 'inline';
  const isHeadless = config.launcher === 'button';
  const placement = config.placement ?? 'bottom-right';

  const messages = useSignal<Message[]>([]);
  const input = useSignal('');
  const streaming = useSignal(false);
  /** Latest pipeline activity label shown under the pending bubble during streaming. */
  const activity = useSignal<string | null>(null);
  /** Floating panel size: 'side' (default bottom-right) or 'center' (expanded modal). */
  const size = useSignal<'side' | 'center'>('side');

  const storageKey = sessionKey(config.accessToken);
  const sessionId = useSignal<string | undefined>(readStoredSession(storageKey));

  const abortRef = useRef<AbortController | null>(null);

  const title = useComputed(
    () => config.chatTitle ?? serverConfig.value?.name ?? 'Assistant',
  );
  const placeholder = useComputed(
    () => serverConfig.value?.placeholder ?? 'Type your question…',
  );
  const showBranding = useComputed(
    () => serverConfig.value?.showBranding !== false,
  );
  const emit = config.onEvent;

  // Apply theme whenever server config changes. The greeting is no longer
  // seeded as a message — it's rendered in the Welcome screen shown while
  // messages is empty, so the first turn doesn't look like a one-sided
  // conversation.
  useEffect(() => {
    // Theme is resolved entirely from init-time config; it doesn't depend on
    // serverConfig anymore (styling is baked into the snippet, not fetched).
    // Still re-applied once on mount so the shadow host picks up the vars.
    const resolved = resolveTheme(config.theme, {
      primaryColor: config.primaryColor,
      backgroundColor: config.backgroundColor,
      surfaceColor: config.surfaceColor,
      borderRadius: config.borderRadius,
      fontFamily: config.fontFamily,
    });
    onThemeResolved(resolved.cssVars);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc closes the floating panel (no-op in inline mode).
  useEffect(() => {
    if (isInline) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open.value) {
        e.stopPropagation();
        open.value = false;
        emit?.({ type: 'chat:close' });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startNewChat = () => {
    abortRef.current?.abort();
    sessionId.value = undefined;
    writeStoredSession(storageKey, undefined);
    // Clear messages entirely; the welcome screen will render in their place.
    messages.value = [];
    activity.value = null;
    streaming.value = false;
    input.value = '';
    emit?.({ type: 'chat:new' });
  };

  const toggleSize = () => {
    size.value = size.value === 'side' ? 'center' : 'side';
    emit?.({ type: size.value === 'center' ? 'chat:expand' : 'chat:collapse' });
  };

  const runSend = async (text: string) => {
    if (!text.trim() || streaming.value) return;

    const userMsg: Message = { id: makeId(), role: 'user', text };
    const pending: Message = { id: makeId(), role: 'assistant', text: '' };
    messages.value = [...messages.value, userMsg, pending];
    streaming.value = true;
    activity.value = null;
    emit?.({ type: 'chat:send', payload: { message: text } });

    const ac = new AbortController();
    abortRef.current = ac;
    let gotContent = false;
    const collectedSources: Source[] = [];

    try {
      for await (const event of streamChat({
        apiBaseUrl,
        accessToken: config.accessToken,
        message: text,
        sessionId: sessionId.value,
        signal: ac.signal,
      })) {
        if (event.type === 'content' && typeof event.text === 'string') {
          gotContent = true;
          activity.value = null;
          pending.text += event.text;
          messages.value = [...messages.value.slice(0, -1), { ...pending }];
        } else if (event.type === 'sources' && Array.isArray(event.sources)) {
          const list = event.sources as Source[];
          for (const s of list) {
            if (!collectedSources.some((x) => x.id === s.id)) collectedSources.push(s);
          }
          pending.sources = collectedSources.slice();
          messages.value = [...messages.value.slice(0, -1), { ...pending }];
        } else if (event.type === 'preset' && typeof event.preset === 'string') {
          // Backend asked us to render a rich card/grid/list below the text.
          const data = event.data as PresetPayload | undefined;
          if (data?.items && data?.displayConfig) {
            pending.preset = event.preset;
            pending.presetPayload = data;
            messages.value = [...messages.value.slice(0, -1), { ...pending }];
          }
        } else if (event.type === 'done') {
          if (typeof event.sessionId === 'string') {
            sessionId.value = event.sessionId;
            writeStoredSession(storageKey, event.sessionId);
          }
          activity.value = null;
          emit?.({ type: 'chat:done', payload: { sessionId: event.sessionId } });
          // message_received fires once the assistant's complete reply has
          // streamed in. Hosts usually want this rather than chat:done for
          // conversion tracking (answer delivered, not just stream ended).
          emit?.({
            type: 'chat:message_received',
            payload: {
              text: pending.text,
              sessionId: event.sessionId,
              hasSources: !!pending.sources?.length,
              hasPreset: !!pending.preset,
            },
          });
        } else if (event.type === 'error') {
          throw new Error(event.message ?? 'Chat error');
        } else if (!gotContent) {
          const label = humanizeActivity(event);
          if (label) activity.value = label;
        }
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Something went wrong.';
      messages.value = [
        ...messages.value.slice(0, -1),
        { id: pending.id, role: 'error', text: msg, originalQuery: text },
      ];
      emit?.({ type: 'chat:error', payload: { message: msg } });
    } finally {
      streaming.value = false;
      activity.value = null;
      abortRef.current = null;
    }
  };

  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    runSend(text);
  };

  const retry = (failedMessageId: string, originalQuery: string) => {
    // Drop the error bubble so the retry starts clean.
    messages.value = messages.value.filter((m) => m.id !== failedMessageId);
    // Also drop the trailing user message — runSend will re-add it.
    if (messages.value.at(-1)?.role === 'user') {
      messages.value = messages.value.slice(0, -1);
    }
    runSend(originalQuery);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // Headless mode: render nothing when closed. Host is responsible for
  // calling window.ChatDropinUI.open(containerId) from their own trigger.
  if (isHeadless && !open.value) {
    return null;
  }

  if (!isInline && !isHeadless && !open.value) {
    return (
      <button
        class={`ik-launcher ik-launcher--${placement}`}
        aria-label="Open chat"
        onClick={() => {
          open.value = true;
          emit?.({ type: 'chat:open' });
        }}
      >
        <ChatIcon />
      </button>
    );
  }

  const panelClass = isInline
    ? 'ik-panel ik-panel--inline'
    : `ik-panel ik-panel--floating ik-panel--${placement} ik-panel--size-${size.value}`;

  return (
    <div class={panelClass}>
      <header class="ik-header">
        <div class="ik-header-brand">
          {config.logoUrl && (
            <img src={config.logoUrl} alt="" class="ik-header-logo" />
          )}
          <span class="ik-title">{title}</span>
        </div>
        <div class="ik-header-actions">
          <button
            class="ik-icon-btn"
            aria-label="New chat"
            title="New chat"
            onClick={startNewChat}
            disabled={streaming.value}
          >
            <NewChatIcon />
          </button>
          {!isInline && (
            <button
              class="ik-icon-btn"
              aria-label={size.value === 'side' ? 'Expand to center' : 'Dock to side'}
              title={size.value === 'side' ? 'Expand to center' : 'Dock to side'}
              onClick={toggleSize}
            >
              {size.value === 'side' ? <ExpandIcon /> : <CollapseIcon />}
            </button>
          )}
          {!isInline && (
            <button
              class="ik-icon-btn"
              aria-label="Minimize"
              title="Minimize"
              onClick={() => {
                open.value = false;
                emit?.({ type: 'chat:close' });
              }}
            >
              <MinimizeIcon />
            </button>
          )}
        </div>
      </header>

      {messages.value.length === 0 ? (
        <Welcome
          title={title.value}
          greeting={config.initialMessage ?? serverConfig.value?.greeting}
          description={serverConfig.value?.description}
          suggestedQuestions={serverConfig.value?.suggestedQuestions ?? []}
          disabled={streaming.value}
          onAsk={(q) => {
            emit?.({ type: 'chat:suggested_question_clicked', payload: { question: q } });
            input.value = q;
            send();
          }}
        />
      ) : (
        <MessageList
          messages={messages.value}
          activity={streaming.value ? activity.value : null}
          onRetry={retry}
        />
      )}

      <form
        class="ik-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          class="ik-input"
          rows={1}
          placeholder={placeholder}
          value={input.value}
          onInput={(e) => (input.value = (e.currentTarget as HTMLTextAreaElement).value)}
          onKeyDown={onKeyDown}
          disabled={streaming.value}
        />
        <button
          type="submit"
          class="ik-send"
          disabled={streaming.value || !input.value.trim()}
          aria-label="Send message"
        >
          <SendIcon />
        </button>
      </form>

      {showBranding.value && <div class="ik-branding">Powered by Interakt</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Humanize pipeline events into a one-line "what the AI is doing" label
// ─────────────────────────────────────────────────────────────────────────────

function humanizeActivity(event: ChatStreamEvent): string | null {
  if (event.type === 'step_start') {
    const name = typeof event.stepName === 'string' ? event.stepName : null;
    return name ? `${name}…` : 'Working…';
  }
  if (event.type === 'action_step') {
    const step = typeof event.step === 'string' ? event.step : '';
    const tool = typeof event.toolSlug === 'string' ? event.toolSlug : '';
    const sub = step.charAt(0).toUpperCase() + step.slice(1).replace(/_/g, ' ');
    return sub ? `${sub}${tool ? ` with ${tool}` : ''}…` : 'Working…';
  }
  if (event.type === 'tool_call') {
    const name = typeof event.name === 'string' ? event.name : 'tool';
    return `Running ${name}…`;
  }
  if (event.type === 'tool_result') {
    const count = typeof event.resultCount === 'number' ? event.resultCount : null;
    if (count != null) return `Found ${count} result${count === 1 ? '' : 's'}`;
    return null;
  }
  if (event.type === 'classification') return 'Understanding your request…';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Messages + activity line
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Welcome screen — shown while the thread is empty. Surfaces the admin-configured
// persona, greeting, description, and suggested questions instead of seeding
// them as a lone assistant bubble.
// ─────────────────────────────────────────────────────────────────────────────

function Welcome({
  title,
  greeting,
  description,
  suggestedQuestions,
  disabled,
  onAsk,
}: {
  title: string;
  greeting: string | undefined;
  description: string | undefined;
  suggestedQuestions: string[];
  disabled: boolean;
  onAsk: (question: string) => void;
}) {
  return (
    <div class="ik-welcome">
      <div class="ik-welcome-avatar" aria-hidden="true">
        <SparkleIcon />
      </div>
      <div class="ik-welcome-title">{title}</div>
      {greeting && <div class="ik-welcome-greeting">{greeting}</div>}
      {description && <div class="ik-welcome-desc">{description}</div>}
      {suggestedQuestions.length > 0 && (
        <div class="ik-welcome-questions">
          <div class="ik-welcome-questions-label">Try asking</div>
          {suggestedQuestions.map((q) => (
            <button
              key={q}
              type="button"
              class="ik-welcome-q"
              disabled={disabled}
              onClick={() => onAsk(q)}
            >
              <span class="ik-welcome-q-text">{q}</span>
              <SendArrowIcon />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path
        d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5zm7 11l1 2.5L22.5 17 20 18l-1 2.5L18 18l-2.5-1L18 16l1-2z"
        fill="currentColor"
      />
    </svg>
  );
}

function SendArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true" class="ik-welcome-q-arrow">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function MessageList({
  messages,
  activity,
  onRetry,
}: {
  messages: Message[];
  activity: string | null;
  onRetry: (messageId: string, query: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activity]);

  return (
    <div class="ik-messages" ref={scrollerRef}>
      {messages.map((m, i) => (
        <MessageBubble
          key={m.id}
          message={m}
          onRetry={onRetry}
          // Only show activity beneath the last (pending) assistant bubble.
          activity={i === messages.length - 1 && m.role === 'assistant' ? activity : null}
        />
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  activity,
  onRetry,
}: {
  message: Message;
  activity: string | null;
  onRetry: (messageId: string, query: string) => void;
}) {
  const html = useMemo(() => {
    if (message.role === 'user' || !message.text) return null;
    const parsed = marked.parse(message.text, { async: false }) as string;
    return DOMPurify.sanitize(parsed);
  }, [message.role, message.text]);

  if (message.role === 'user') {
    return <div class="ik-msg ik-msg--user">{message.text}</div>;
  }

  if (message.role === 'error') {
    return (
      <div class="ik-msg ik-msg--error">
        <div>{message.text}</div>
        {message.originalQuery && (
          <button
            type="button"
            class="ik-retry"
            onClick={() => onRetry(message.id, message.originalQuery!)}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  // Assistant
  return (
    <div class="ik-msg ik-msg--assistant">
      {html && <div class="ik-msg-body" dangerouslySetInnerHTML={{ __html: html }} />}
      {message.preset && message.presetPayload && (
        <div class="ik-preset">
          <PresetRenderer
            preset={message.preset}
            items={message.presetPayload.items}
            config={message.presetPayload.displayConfig}
          />
        </div>
      )}
      {activity && (
        <div class="ik-activity" aria-live="polite">
          <span class="ik-activity-dot" />
          {activity}
        </div>
      )}
      {message.sources && message.sources.length > 0 && <SourceList sources={message.sources} />}
    </div>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  const open = useSignal(false);
  const label = `${sources.length} source${sources.length === 1 ? '' : 's'}`;
  return (
    <div class="ik-sources">
      <button
        type="button"
        class="ik-sources-toggle"
        onClick={() => (open.value = !open.value)}
        aria-expanded={open.value}
      >
        <BookIcon />
        <span>{label}</span>
        <span class={`ik-caret ${open.value ? 'ik-caret--open' : ''}`}>▾</span>
      </button>
      {open.value && (
        <ul class="ik-sources-list">
          {sources.map((s) => (
            <li key={s.id} class="ik-source">
              <span class="ik-source-title">{s.title ?? s.id}</span>
              {s.dataSource && <span class="ik-source-meta">{s.dataSource}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <path
        d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M3 20l18-8L3 4v6l13 2-13 2v6z" fill="currentColor" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M6 12h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
      <path
        d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M15 20h4a1 1 0 0 0 1-1v-4M9 20H5a1 1 0 0 1-1-1v-4"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
      <path
        d="M4 9h4a1 1 0 0 0 1-1V4M20 9h-4a1 1 0 0 1-1-1V4M20 15h-4a1 1 0 0 0-1 1v4M4 15h4a1 1 0 0 1 1 1v4"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </svg>
  );
}

function NewChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M4 12a8 8 0 0 1 13.7-5.7L20 4v6h-6"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
      <path
        d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v16H5.5A1.5 1.5 0 0 1 4 17.5v-13zM4 17.5A1.5 1.5 0 0 0 5.5 19H19"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}
