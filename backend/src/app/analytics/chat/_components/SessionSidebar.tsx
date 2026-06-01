// app/analytics/chat/_components/SessionSidebar.tsx

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ScrollArea } from '@/shared/ui/components/scroll-area';
import { Button } from '@/shared/ui/components/button';
import { Skeleton } from '@/shared/ui/components/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/components/alert-dialog';
import {
  Plus,
  MessageSquare,
  Trash2,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface SessionSummary {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

interface SessionsResponse {
  success: boolean;
  data: {
    sessions: SessionSummary[];
    pagination: {
      limit: number;
      offset: number;
      total: number;
      hasMore: boolean;
    };
  };
}

interface SessionSidebarProps {
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
}

// ============================================================================
// HOOKS
// ============================================================================

function useSessions() {
  return useQuery({
    queryKey: ['admin-chat-sessions'],
    queryFn: async (): Promise<SessionsResponse> => {
      const response = await fetch('/api/analytics/chat/sessions?limit=50');
      if (!response.ok) throw new Error('Failed to fetch sessions');
      return response.json();
    },
    staleTime: 30000, // 30 seconds
  });
}

function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await fetch(`/api/analytics/chat/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete session');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-chat-sessions'] });
    },
  });
}

// ============================================================================
// COMPONENTS
// ============================================================================

interface SessionItemProps {
  session: SessionSummary;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function SessionItem({ session, isActive, onSelect, onDelete }: SessionItemProps) {
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div
      className={cn(
        'group relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'hover:bg-muted'
      )}
      onClick={onSelect}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      <div className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
        isActive ? 'bg-primary/20' : 'bg-muted'
      )}>
        <MessageSquare className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{session.title}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{session.messageCount} messages</span>
          {session.lastMessageAt && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(session.lastMessageAt), { addSuffix: true })}
              </span>
            </>
          )}
        </div>
      </div>

      {showDelete && !isActive && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </Button>
      )}

      {isActive && (
        <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
      )}
    </div>
  );
}

function SessionSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="h-8 w-8 rounded-lg" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SessionSidebar({
  currentSessionId,
  onSelectSession,
  onNewSession,
}: SessionSidebarProps) {
  const { data, isLoading } = useSessions();
  const deleteSession = useDeleteSession();
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  const sessions = data?.data?.sessions || [];

  const handleDelete = async () => {
    if (!sessionToDelete) return;

    try {
      await deleteSession.mutateAsync(sessionToDelete);
      // If we deleted the current session, create a new one
      if (sessionToDelete === currentSessionId) {
        onNewSession();
      }
    } finally {
      setSessionToDelete(null);
    }
  };

  return (
    <>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b p-3">
          <Button
            onClick={onNewSession}
            className="w-full justify-start gap-2 rounded-lg"
            variant="outline"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>

        {/* Sessions List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {isLoading ? (
              <>
                <SessionSkeleton />
                <SessionSkeleton />
                <SessionSkeleton />
              </>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No chat history</p>
                <p className="text-xs text-muted-foreground/70">Start a new conversation</p>
              </div>
            ) : (
              sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === currentSessionId}
                  onSelect={() => onSelectSession(session.id)}
                  onDelete={() => setSessionToDelete(session.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Footer with count */}
        {sessions.length > 0 && (
          <div className="border-t px-3 py-2">
            <p className="text-xs text-muted-foreground text-center">
              {data?.data?.pagination?.total || sessions.length} conversations
            </p>
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!sessionToDelete} onOpenChange={() => setSessionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this chat session and all its messages.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
