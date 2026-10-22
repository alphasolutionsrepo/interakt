'use client';

// src/shared/ui/custom/HelpChat.tsx
//
// "Ask AI" in the help drawer: a lean chat with the seeded "Help Assistant"
// experience (Interakt answering about Interakt, grounded in the product
// docs). Streams the answer over SSE — same protocol as the admin
// ChatTestPanel. useHelpChat holds the conversation (the drawer owns the
// input box); HelpConversation renders it. If the assistant hasn't been set
// up yet, it degrades to a friendly prompt rather than erroring.

import { BookOpen, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { DocBody } from '@/shared/help/DocBody';
import { HELP_EXPERIENCE_SLUG } from '@/shared/help/help-content';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Current pipeline step label, shown while the assistant is still thinking. */
  step?: string;
}

export interface HelpChat {
  messages: ChatMessage[];
  busy: boolean;
  /** The Help Assistant experience doesn't exist yet. */
  notReady: boolean;
  send: (text: string) => Promise<void>;
  /** Start over (new session). */
  reset: () => void;
}

export function useHelpChat(): HelpChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [notReady, setNotReady] = useState(false);
  const sessionId = useRef<string | null>(null);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      setNotReady(false);

      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed };
      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: 'assistant', content: '', step: 'Thinking…' },
      ]);

      const sid = sessionId.current ?? crypto.randomUUID();
      sessionId.current = sid;

      const patch = (fn: (m: ChatMessage) => ChatMessage) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)));

      try {
        const res = await fetch(`/api/v1/ai-experiences/${HELP_EXPERIENCE_SLUG}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed, sessionId: sid }),
        });

        // The assistant hasn't been built yet (experience missing) — guide the user.
        if (res.status === 404) {
          setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userMsg.id));
          setNotReady(true);
          return;
        }
        if (!res.ok || !res.body) throw new Error(`Request failed (HTTP ${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;
            let ev: Record<string, unknown>;
            try {
              ev = JSON.parse(raw);
            } catch {
              continue;
            }
            const type = ev.type as string;
            if (type === 'step_start' && typeof ev.name === 'string') {
              patch((m) => ({ ...m, step: ev.name as string }));
            } else if (type === 'content') {
              const chunk = (ev.text as string) ?? (ev.content as string) ?? '';
              if (chunk) patch((m) => ({ ...m, content: m.content + chunk, step: undefined }));
            } else if (type === 'done') {
              if (typeof ev.responseText === 'string' && ev.responseText) {
                patch((m) => ({ ...m, content: ev.responseText as string, step: undefined }));
              } else {
                patch((m) => ({ ...m, step: undefined }));
              }
            } else if (type === 'error') {
              patch((m) => ({
                ...m,
                content: m.content || `Sorry — something went wrong: ${String(ev.error ?? 'unknown error')}`,
                step: undefined,
              }));
            }
          }
        }
        // Safety net: clear any lingering step indicator.
        patch((m) => ({ ...m, step: undefined }));
      } catch (e) {
        patch((m) => ({
          ...m,
          content: m.content || `Sorry — I couldn't reach the assistant. ${e instanceof Error ? e.message : ''}`,
          step: undefined,
        }));
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setNotReady(false);
    sessionId.current = null;
  }, []);

  return { messages, busy, notReady, send, reset };
}

const GENERIC_SUGGESTIONS = [
  'How do I create a search index?',
  'How do I add a tool to a chat experience?',
  'How do I configure an AI provider?',
];

/** Example questions for an empty conversation; the first is about the current screen when there is one. */
export function askSuggestions(pageTitle?: string): string[] {
  return pageTitle
    ? [`How do I use ${pageTitle.toLowerCase()}?`, ...GENERIC_SUGGESTIONS].slice(0, 3)
    : GENERIC_SUGGESTIONS;
}

/** Shown in Ask AI mode before the first question. */
export function AskIntro({ suggestions, onAsk }: { suggestions: string[]; onAsk: (q: string) => void }) {
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Sparkles className="size-3.5 text-primary" /> Answers come from the product docs, with sources. Try:
      </p>
      <div className="space-y-1.5">
        {suggestions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onAsk(q)}
            className="flex w-full items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-left text-sm hover:bg-accent"
          >
            <BookOpen className="size-3.5 shrink-0 text-muted-foreground" />
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AssistantNotReady() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-muted-foreground">
      <Sparkles className="size-8 opacity-50" />
      <p className="font-medium text-foreground">The Help Assistant isn&apos;t set up yet</p>
      <p className="max-w-xs text-xs">
        An admin can enable it in Initial Setup once an AI provider is configured. Searching the docs works in the
        meantime.
      </p>
      <Link href="/setup" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        Go to Initial Setup
      </Link>
    </div>
  );
}

/** The conversation so far. Scrolls itself to the newest message. */
export function HelpConversation({
  messages,
  onSourceClick,
}: {
  messages: ChatMessage[];
  /** Called when the user clicks a source link in an answer, so the drawer can close while navigating. */
  onSourceClick?: () => void;
}) {
  const router = useRouter();
  const endRef = useRef<HTMLDivElement>(null);

  // Internal doc links in assistant answers are sources — route them to the
  // canonical /docs/<slug> URL (instead of leaving them as broken externals).
  const handleSource = useCallback(
    (resolvedSlug: string) => {
      router.push(`/docs/${resolvedSlug}`);
      onSourceClick?.();
    },
    [router, onSourceClick],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="space-y-4">
      {messages.map((m) =>
        m.role === 'user' ? (
          <div key={m.id} className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
              {m.content}
            </div>
          </div>
        ) : (
          <div key={m.id} className="text-sm">
            {m.step ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> {m.step}
              </p>
            ) : (
              <DocBody slug="" content={m.content} onInternalLink={handleSource} />
            )}
          </div>
        ),
      )}
      <div ref={endRef} />
    </div>
  );
}
