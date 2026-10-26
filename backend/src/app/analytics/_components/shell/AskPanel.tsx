// app/analytics/_components/shell/AskPanel.tsx

'use client';

/**
 * The Ask drawer: the analytics conversation beside a section. Docked on wide
 * screens, over the page on narrower ones so the section keeps its width. It
 * answers for the experience and period in the filter bar and keeps the
 * conversation in history, like the full chat page.
 */

import Link from 'next/link';
import { ExternalLink, Plus, Sparkles, X } from 'lucide-react';

import { useAnalyticsContext } from '../../_lib/AnalyticsContext';
import { useAskPanel } from '../../_lib/AskPanelContext';
import type { AnalyticsSection } from '../../_lib/sections';
import { AskConversation } from './AskConversation';
import { ChatHistoryButton } from './ChatHistoryButton';

import { Button } from '@/shared/ui/components/button';
import { cn } from '@/lib/utils';

export function AskPanel({ section }: { section: AnalyticsSection }) {
  const { isOpen, close, chat } = useAskPanel();
  const { experienceId, experienceName, periodLabel } = useAnalyticsContext();

  if (!isOpen) return null;

  return (
    <aside
      aria-label="Ask about your analytics"
      className={cn(
        'flex flex-col border-l bg-background',
        // Below 1280px a docked panel squeezes the section too much, so it opens over the
        // page. From 1280px it docks beside the section, so the filters stay in reach while
        // reading an answer. Docked, it fits under the app bar and the content padding (7rem).
        'fixed inset-y-0 right-0 z-40 w-full max-w-[440px] shadow-xl',
        'min-[1280px]:sticky min-[1280px]:top-0 min-[1280px]:z-auto min-[1280px]:h-[calc(100vh-7rem)] min-[1280px]:w-[360px] min-[1280px]:max-w-none min-[1280px]:shrink-0 min-[1280px]:shadow-none',
        'min-[1600px]:w-[400px]',
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold">
            <Sparkles className="size-4 text-viz-1" aria-hidden /> Ask about this
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {experienceId ? experienceName : 'All experiences'} · {periodLabel} · {section.label}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <ChatHistoryButton />
          {chat.sessionId && (
            <Button variant="ghost" size="icon" className="size-9" asChild>
              <Link href={`/analytics/chat?session=${chat.sessionId}`} aria-label="Open in full chat">
                <ExternalLink className="size-4" />
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="icon" className="size-9" onClick={chat.startNew} aria-label="New conversation">
            <Plus className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-9" onClick={close} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* The app's floating help button sits in the bottom-right corner, over the Send button */}
      <AskConversation suggestions={section.suggestions} inputId="ask-drawer-input" autoFocus formClassName="pr-20" />
    </aside>
  );
}
