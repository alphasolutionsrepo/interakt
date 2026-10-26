// app/dashboard/_components/AskBox.tsx

'use client';

/**
 * The home page's prompt: ask about your experiences' data. The answer opens in
 * the Ask drawer, the same conversation and history as in Analytics. Ready to
 * type in straight away; nothing here waits for data.
 */

import { ArrowUp, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { ChatHistoryButton } from '@/app/analytics/_components/shell/ChatHistoryButton';
import { useAskPanel } from '@/app/analytics/_lib/AskPanelContext';
import { HOME_SECTION } from '@/app/analytics/_lib/sections';
import { Button } from '@/shared/ui/components/button';

export function AskBox() {
  const askPanel = useAskPanel();
  const [text, setText] = useState('');

  const submit = (question: string) => {
    const q = question.trim();
    if (!q) return;
    askPanel.open(q);
    setText('');
  };

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
        className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm focus-within:border-foreground/30 focus-within:shadow-md"
      >
        <label htmlFor="home-ask" className="sr-only">
          Ask about your analytics
        </label>
        <textarea
          id="home-ask"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(text);
            }
          }}
          rows={2}
          placeholder="Ask about your searches, conversations and cost…"
          className="w-full resize-none bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-viz-1" aria-hidden /> Answers use the last 7 days unless you name a period
          </span>
          <div className="flex items-center gap-1">
            {/* Picking an earlier conversation shows it in the drawer */}
            <ChatHistoryButton onOpen={() => askPanel.open()} />
            <Button type="submit" size="icon" className="size-9 rounded-xl" disabled={!text.trim()} aria-label="Ask">
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>
      </form>

      <ul className="flex flex-wrap justify-center gap-2" aria-label="Suggested questions">
        {HOME_SECTION.suggestions.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => submit(s)}
              className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
