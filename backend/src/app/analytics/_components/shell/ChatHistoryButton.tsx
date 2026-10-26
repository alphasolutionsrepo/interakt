// app/analytics/_components/shell/ChatHistoryButton.tsx

'use client';

/**
 * Earlier analytics conversations, from the conversation's header. Picking one
 * opens it in place (inline on the Overview, or in the Ask drawer). They can be
 * searched and deleted here; the full chat page lists them too.
 */

import { History } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { useAskPanel } from '../../_lib/AskPanelContext';

import { ChatHistoryList } from './ChatHistoryList';

import { Button } from '@/shared/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/components/popover';

const SHOWN = 8;

export function ChatHistoryButton() {
  const { chat } = useAskPanel();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" aria-label="Earlier conversations" title="Earlier conversations">
          <History className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <p className="border-b px-3 py-2 text-sm font-medium">Earlier conversations</p>
        {/* Mounted only while open, so history loads when first asked for */}
        {open && (
          <ChatHistoryList
            currentSessionId={chat.sessionId}
            onOpen={(id) => {
              chat.openSession(id);
              setOpen(false);
            }}
            onDeleted={(id) => {
              if (id === chat.sessionId) chat.startNew();
            }}
            limit={SHOWN}
            autoFocus
            listClassName="max-h-80"
          />
        )}
        <div className="border-t px-3 py-2">
          <Link href="/analytics/chat" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            See all conversations
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
