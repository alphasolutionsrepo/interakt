// app/analytics/_components/shell/ChatHistoryList.tsx

'use client';

/**
 * Earlier analytics conversations: search them (titles, experiences and
 * anything said), open one, or delete one. History is shared by every admin,
 * so deleting removes the conversation for everyone; the row asks first.
 */

import { Loader2, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useChatSessions, useDeleteChatSession } from '../../_lib/hooks/useAnalyticsChat';
import { formatTimeAgo, pluralize } from '../viz';

import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/components/button';
import { Input } from '@/shared/ui/components/input';

interface ChatHistoryListProps {
  /** The conversation on screen, marked in the list */
  currentSessionId: string | null;
  onOpen: (sessionId: string) => void;
  /** Called after a conversation is deleted, e.g. to start a new one if it was on screen */
  onDeleted?: (sessionId: string) => void;
  /** Rows shown before searching; all matches are shown once searching */
  limit?: number;
  autoFocus?: boolean;
  listClassName?: string;
}

export function ChatHistoryList({
  currentSessionId,
  onOpen,
  onDeleted,
  limit,
  autoFocus,
  listClassName,
}: ChatHistoryListProps) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  // Search as the user types, without a request per keystroke
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const sessions = useChatSessions({ search });
  const remove = useDeleteChatSession();
  const all = sessions.data?.data?.sessions ?? [];
  const list = search.trim() || !limit ? all : all.slice(0, limit);
  const searching = sessions.isFetching && search !== '';

  const confirmDelete = (sessionId: string) =>
    remove.mutate(sessionId, {
      onSuccess: () => {
        setConfirming(null);
        onDeleted?.(sessionId);
      },
    });

  return (
    <div className="flex min-h-0 flex-col">
      <div className="relative border-b p-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search conversations"
          aria-label="Search conversations"
          autoFocus={autoFocus}
          className="h-8 pl-8 text-sm"
        />
        {searching && (
          <Loader2 className="absolute right-4 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
        )}
      </div>

      {sessions.isLoading ? (
        <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
        </p>
      ) : list.length === 0 ? (
        <p className="px-3 py-4 text-sm text-muted-foreground">
          {search.trim() ? `No conversations mention “${search.trim()}”.` : 'No earlier conversations yet.'}
        </p>
      ) : (
        <ul className={cn('overflow-y-auto py-1', listClassName)} aria-label="Earlier conversations">
          {list.map((session) => {
            const current = session.id === currentSessionId;
            const title = session.title || 'Untitled conversation';

            if (confirming === session.id) {
              return (
                <li key={session.id} className="space-y-2 bg-muted/60 px-3 py-2">
                  <p className="text-sm">
                    Delete <span className="font-medium">{title}</span>? It&apos;s removed for every admin.
                  </p>
                  {remove.isError && <p className="text-xs text-destructive">Couldn&apos;t delete it. Try again.</p>}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      disabled={remove.isPending}
                      onClick={() => confirmDelete(session.id)}
                    >
                      {remove.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                      Delete
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirming(null)} autoFocus>
                      Cancel
                    </Button>
                  </div>
                </li>
              );
            }

            return (
              <li key={session.id} className={cn('group flex items-center hover:bg-muted', current && 'bg-muted')}>
                <button
                  type="button"
                  aria-current={current ? 'true' : undefined}
                  onClick={() => onOpen(session.id)}
                  className="min-w-0 flex-1 px-3 py-2 text-left focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span className="block truncate text-sm">{title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {session.experienceName ?? 'All experiences'} · {pluralize(session.messageCount, 'message')} ·{' '}
                    {formatTimeAgo(session.lastMessageAt ?? session.createdAt)}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mr-1 size-7 shrink-0 text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                  aria-label={`Delete ${title}`}
                  title="Delete conversation"
                  onClick={() => {
                    remove.reset();
                    setConfirming(session.id);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
