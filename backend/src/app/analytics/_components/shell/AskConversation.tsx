// app/analytics/_components/shell/AskConversation.tsx

'use client';

/**
 * The analytics conversation itself: messages, suggested questions and the
 * question box. Shown inline on the Overview and inside the Ask drawer; both
 * show the same conversation.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Send, StopCircle } from 'lucide-react';

import { MessageBubble } from '../../chat/_components/MessageBubble';
import { useAnalyticsContext } from '../../_lib/AnalyticsContext';
import { useAskPanel } from '../../_lib/AskPanelContext';

import { Button } from '@/shared/ui/components/button';
import { Textarea } from '@/shared/ui/components/textarea';
import { cn } from '@/lib/utils';

export function AskConversation({
  suggestions,
  inputId,
  autoFocus = false,
  formClassName,
}: {
  suggestions: string[];
  /** Unique per place the conversation is shown, for the question box's label */
  inputId: string;
  autoFocus?: boolean;
  /** Extra classes for the question box row, e.g. room for a floating button */
  formClassName?: string;
}) {
  const { chat, ask } = useAskPanel();
  const { experienceId, experienceName, periodLabel } = useAnalyticsContext();
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.messages]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const submit = () => {
    const question = input.trim();
    if (!question || chat.isLoading) return;
    setInput('');
    ask(question);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {chat.scopeNotice && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            {chat.scopeNotice}
          </p>
        )}
        {chat.messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask anything about {experienceId ? experienceName : 'all experiences'}, {periodLabel.toLowerCase()} unless you name another period.
              Answers say which data they used.
            </p>
            {suggestions.length > 0 && (
              <ul className="space-y-2" aria-label="Suggested questions">
                {suggestions.map((question) => (
                  <li key={question}>
                    <button
                      type="button"
                      onClick={() => ask(question)}
                      className="w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {question}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/analytics/chat" className="inline-block text-xs text-muted-foreground underline-offset-2 hover:underline">
              Earlier conversations
            </Link>
          </div>
        ) : (
          chat.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onFollowUpClick={ask}
              streamingState={
                message.isStreaming
                  ? { status: chat.streamStatus, activeTool: chat.activeTool, toolsExecuted: chat.toolsExecuted }
                  : undefined
              }
            />
          ))
        )}
        <div ref={endRef} />
      </div>

      <form
        className={cn('border-t p-3', formClassName)}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Your question
        </label>
        <div className="flex items-end gap-2">
          <Textarea
            id={inputId}
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder="Ask a question…"
            className="min-h-[44px] resize-none"
          />
          {chat.isLoading ? (
            <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" onClick={chat.stop} aria-label="Stop">
              <StopCircle className="size-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" className="size-11 shrink-0" disabled={!input.trim()} aria-label="Send">
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
