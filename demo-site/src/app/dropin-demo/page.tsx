'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  MessageCircle,
  Search,
  Settings,
  RotateCcw,
  CheckCircle2,
  Keyboard,
  Sparkles,
} from 'lucide-react';
import { SettingsModal, type WidgetKind } from './settings-modal';

/**
 * Drop-in sandbox.
 *
 * Loads like a plain customer site — prospects see a realistic page with the
 * widgets layered on top, exactly as they'd appear after pasting the Interakt
 * embed code into their own HTML. Settings are hidden behind a gear; the page
 * content is the demo.
 */

type SnippetState = {
  chat: string | null;
  search: string | null;
};

const STORAGE_KEY = 'interakt:dropin-sandbox';
const EMPTY: SnippetState = { chat: null, search: null };

export default function DropinSandbox() {
  const [snippets, setSnippets] = useState<SnippetState>(EMPTY);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Track DOM artifacts per widget so clearing one doesn't kill the other.
  const mountsRef = useRef<{ chat: HTMLDivElement | null; search: HTMLDivElement | null }>({
    chat: null,
    search: null,
  });
  const scriptsRef = useRef<{ chat: HTMLScriptElement[]; search: HTMLScriptElement[] }>({
    chat: [],
    search: [],
  });
  const mountAreaRef = useRef<HTMLDivElement>(null);

  // Hydrate snippets from localStorage after first render to avoid SSR mismatches.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSnippets({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Auto-apply stored snippets once we have a mount point.
  useEffect(() => {
    if (!hydrated) return;
    if (snippets.chat && !mountsRef.current.chat) runSnippet('chat', snippets.chat);
    if (snippets.search && !mountsRef.current.search) runSnippet('search', snippets.search);
    // Persist on change.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snippets, hydrated]);

  /**
   * Parse and mount a widget snippet. Tears down any previous version of the
   * same widget first so re-applying is idempotent.
   */
  const runSnippet = useCallback((kind: WidgetKind, code: string) => {
    if (!mountAreaRef.current) return;
    teardown(kind);

    try {
      const doc = new DOMParser().parseFromString(code, 'text/html');
      const containerDiv = doc.body.querySelector('div[id]');
      const scripts = Array.from(doc.body.querySelectorAll('script'));

      if (!containerDiv || scripts.length === 0) {
        throw new Error('Invalid snippet — need a <div id> and <script>.');
      }

      const mount = document.createElement('div');
      mount.id = containerDiv.id;
      mountAreaRef.current.appendChild(mount);
      mountsRef.current[kind] = mount;

      const external = scripts.find((s) => s.src);
      const inlineScripts = scripts.filter((s) => !s.src);

      const runInlines = () => {
        for (const original of inlineScripts) {
          const fresh = document.createElement('script');
          fresh.textContent = original.textContent ?? '';
          document.body.appendChild(fresh);
          scriptsRef.current[kind].push(fresh);
        }
      };

      if (external) {
        const src = external.getAttribute('src') ?? '';
        const existing = document.querySelector(
          `script[data-dropin-src="${src}"]`,
        ) as HTMLScriptElement | null;

        // An in-DOM <script> tag may still be loading when a sibling snippet
        // triggers this path in the same synchronous tick (e.g. both chat +
        // search snippets restored from localStorage). Gate the inline script
        // on the widget's global actually being attached.
        const widgetReady = () => {
          const w = window as unknown as {
            ChatDropinUI?: unknown;
            SearchDropinUI?: unknown;
          };
          return kind === 'chat' ? w.ChatDropinUI != null : w.SearchDropinUI != null;
        };

        if (existing) {
          if (widgetReady()) {
            runInlines();
          } else {
            existing.addEventListener('load', runInlines, { once: true });
            existing.addEventListener(
              'error',
              () => console.error(`[dropin] Failed to load ${src}`),
              { once: true },
            );
          }
        } else {
          const fresh = document.createElement('script');
          fresh.src = src;
          fresh.dataset.dropinSrc = src;
          fresh.async = true;
          fresh.onload = runInlines;
          fresh.onerror = () => console.error(`[dropin] Failed to load ${src}`);
          document.body.appendChild(fresh);
          scriptsRef.current[kind].push(fresh);
        }
      } else {
        runInlines();
      }
    } catch (err) {
      console.error('[dropin]', err);
    }
  }, []);

  /** Destroy the widget's globals and DOM for a specific kind. */
  const teardown = (kind: WidgetKind) => {
    type DropinGlobal = { destroy?: (containerId?: string) => void };
    const w = window as unknown as {
      ChatDropinUI?: DropinGlobal;
      SearchDropinUI?: DropinGlobal;
    };
    const container = mountsRef.current[kind];
    if (kind === 'chat') w.ChatDropinUI?.destroy?.(container?.id);
    if (kind === 'search') w.SearchDropinUI?.destroy?.(container?.id);
    container?.remove();
    mountsRef.current[kind] = null;
    scriptsRef.current[kind].forEach((s) => s.remove());
    scriptsRef.current[kind] = [];
  };

  const applyWidget = (kind: WidgetKind, code: string) => {
    setSnippets((prev) => ({ ...prev, [kind]: code }));
    runSnippet(kind, code);
  };

  const clearWidget = (kind: WidgetKind) => {
    teardown(kind);
    setSnippets((prev) => ({ ...prev, [kind]: null }));
  };

  const resetAll = () => {
    teardown('chat');
    teardown('search');
    setSnippets(EMPTY);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const hasAny = !!(snippets.chat || snippets.search);

  return (
    <div className="relative">
      {/* Toolbar — sticky, non-intrusive; scrolls with page */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b border-border/60">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
              Drop-in sandbox
            </Badge>
            <WidgetStatus label="Chat" running={!!snippets.chat} />
            <WidgetStatus label="Search" running={!!snippets.search} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings className="w-4 h-4 mr-2" />
              Configure
            </Button>
            {hasAny && (
              <Button variant="ghost" size="sm" onClick={resetAll}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Mock customer-site content */}
      <main className="max-w-5xl mx-auto px-6 py-16">
        <section className="text-center max-w-3xl mx-auto">
          <Badge className="bg-primary/10 text-primary border-0 mb-4">
            <Sparkles className="w-3 h-3 mr-1.5" />
            This page is a blank customer site
          </Badge>
          <h1 className="text-5xl font-bold tracking-tight mb-4">
            See the drop-in in context
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Everything on this page is static. The live chat bubble, ⌘K search, and any product
            cards that appear come entirely from the embed code you paste into settings — the
            same three-line snippet your customers would paste into their own HTML.
          </p>
        </section>

        <section className="mt-12 grid md:grid-cols-2 gap-4">
          <HintCard
            icon={<MessageCircle className="w-5 h-5" />}
            title="Try the chat"
            desc="Tap the floating bubble (bottom right) to open the assistant. Ask it something your experience can answer — try 'show me shoes'."
            ready={!!snippets.chat}
            emptyHint="Paste a chat embed snippet via the ⚙ Configure button."
            onConfigure={() => setSettingsOpen(true)}
          />
          <HintCard
            icon={<Search className="w-5 h-5" />}
            title="Try the search"
            desc={
              <>
                Press <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">
                  ⌘K
                </kbd>{' '}
                (or <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">
                  Ctrl K
                </kbd>
                ) to open instant search.
              </>
            }
            ready={!!snippets.search}
            emptyHint="Paste a search embed snippet via the ⚙ Configure button."
            onConfigure={() => setSettingsOpen(true)}
          />
        </section>

        <section className="mt-16 max-w-3xl mx-auto space-y-6">
          <h2 className="text-2xl font-semibold">How the sandbox works</h2>
          <div className="space-y-4 text-muted-foreground leading-relaxed">
            <p>
              When you click <strong className="text-foreground">⚙ Configure</strong>, a modal lets
              you paste the embed code for a chat experience, a search experience, or both. The
              sandbox parses the snippet, injects the container into this page, and loads the
              bundle — exactly the same flow a customer would get.
            </p>
            <p>
              Everything persists in your browser&apos;s local storage, so the next time you open
              this page the widgets come back already running. Click{' '}
              <strong className="text-foreground">↻ Reset</strong> to wipe state and start fresh.
            </p>
            <p>
              Grab snippets from the admin dashboard:{' '}
              <code className="bg-muted px-2 py-0.5 rounded text-xs">Experiences → open any experience → Embed Code</code>.
            </p>
          </div>
        </section>

        {/* First-run empty state */}
        {!hasAny && hydrated && (
          <section className="mt-16 border border-dashed border-border rounded-2xl p-8 max-w-2xl mx-auto text-center bg-muted/30">
            <Keyboard className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-1">Nothing running yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Paste an embed snippet to see it come alive on this page.
            </p>
            <Button onClick={() => setSettingsOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Settings className="w-4 h-4 mr-2" />
              Configure widgets
            </Button>
          </section>
        )}
      </main>

      {/* Widgets mount here — visually invisible; floating/modal widgets position themselves. */}
      <div ref={mountAreaRef} aria-hidden="true" />

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        snippets={snippets}
        onApply={applyWidget}
        onClear={clearWidget}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small inline components
// ─────────────────────────────────────────────────────────────────────────────

function WidgetStatus({ label, running }: { label: string; running: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${
        running ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          running ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40'
        }`}
      />
      {label} {running ? 'live' : 'off'}
    </span>
  );
}

function HintCard({
  icon,
  title,
  desc,
  ready,
  emptyHint,
  onConfigure,
}: {
  icon: React.ReactNode;
  title: string;
  desc: React.ReactNode;
  ready: boolean;
  emptyHint: string;
  onConfigure: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 flex items-start gap-3">
      <div
        className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
          ready ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold">{title}</h3>
          {ready && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
        </div>
        {ready ? (
          <p className="text-sm text-muted-foreground">{desc}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-2">{emptyHint}</p>
            <button
              type="button"
              onClick={onConfigure}
              className="text-sm text-primary font-medium hover:underline"
            >
              Configure →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
