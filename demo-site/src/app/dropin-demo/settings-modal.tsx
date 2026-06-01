'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MessageCircle, Search, Clipboard, AlertCircle, CheckCircle2 } from 'lucide-react';

export type WidgetKind = 'chat' | 'search';

interface SnippetState {
  chat: string | null;
  search: string | null;
}

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snippets: SnippetState;
  onApply: (kind: WidgetKind, code: string) => void;
  onClear: (kind: WidgetKind) => void;
}

/**
 * Configure-widgets modal. Two segmented tabs (Chat / Search), each with its
 * own editable snippet, apply button, and clear button. Runs both widgets
 * independently — you can configure either or both.
 */
export function SettingsModal({
  open,
  onOpenChange,
  snippets,
  onApply,
  onClear,
}: SettingsModalProps) {
  const [active, setActive] = useState<WidgetKind>('chat');
  const [chatDraft, setChatDraft] = useState(snippets.chat ?? '');
  const [searchDraft, setSearchDraft] = useState(snippets.search ?? '');
  const [error, setError] = useState<string | null>(null);

  // Re-sync drafts whenever the modal opens (or the underlying saved snippet changes).
  useEffect(() => {
    if (open) {
      setChatDraft(snippets.chat ?? '');
      setSearchDraft(snippets.search ?? '');
      setError(null);
    }
  }, [open, snippets.chat, snippets.search]);

  const draft = active === 'chat' ? chatDraft : searchDraft;
  const setDraft = active === 'chat' ? setChatDraft : setSearchDraft;
  const isRunning = active === 'chat' ? !!snippets.chat : !!snippets.search;

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setDraft(text);
    } catch {
      setError('Clipboard read is blocked — paste manually (Cmd/Ctrl+V).');
    }
  };

  const apply = () => {
    const code = draft.trim();
    if (!code) {
      setError('Paste a snippet first.');
      return;
    }
    setError(null);
    onApply(active, code);
  };

  const clear = () => {
    setDraft('');
    setError(null);
    onClear(active);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure drop-in widgets</DialogTitle>
          <DialogDescription>
            Paste the embed code from <code className="text-xs">Admin → Experience → Embed Code</code>. You can run both widgets at once.
          </DialogDescription>
        </DialogHeader>

        {/* Segmented tabs */}
        <div className="flex gap-1 p-1 rounded-lg bg-muted/60 border border-border/60">
          <TabButton
            active={active === 'chat'}
            onClick={() => setActive('chat')}
            icon={<MessageCircle className="w-4 h-4" />}
            label="Chat"
            running={!!snippets.chat}
          />
          <TabButton
            active={active === 'search'}
            onClick={() => setActive('search')}
            icon={<Search className="w-4 h-4" />}
            label="Search"
            running={!!snippets.search}
          />
        </div>

        <div className="space-y-3 py-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            rows={12}
            placeholder={placeholderFor(active)}
            className="w-full rounded-lg border bg-muted text-foreground text-xs font-mono p-4 resize-y focus:outline-none focus:ring-2 focus:ring-ring/30"
          />

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-900">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={paste}>
                <Clipboard className="w-4 h-4 mr-2" />
                Paste
              </Button>
              {isRunning && (
                <Button variant="outline" size="sm" onClick={clear}>
                  Clear
                </Button>
              )}
            </div>
            <Button size="sm" onClick={apply} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {isRunning ? 'Re-apply' : 'Apply'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  running,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  running: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
        active
          ? 'bg-background shadow-sm text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {label}
      {running && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
    </button>
  );
}

function placeholderFor(kind: WidgetKind): string {
  if (kind === 'chat') {
    return '<div id="interakt-chat"></div>\n\n<script src="http://localhost:3000/embed/v1/widgets.js"></script>\n\n<script>\n  window.ChatDropinUI.init({\n    containerId: "interakt-chat",\n    accessToken: "YOUR_AI_EXPERIENCE_TOKEN",\n  });\n</script>';
  }
  return '<div id="interakt-search"></div>\n\n<script src="http://localhost:3000/embed/v1/widgets.js"></script>\n\n<script>\n  window.SearchDropinUI.init({\n    containerId: "interakt-search",\n    accessToken: "YOUR_SEARCH_EXPERIENCE_TOKEN",\n  });\n</script>';
}
