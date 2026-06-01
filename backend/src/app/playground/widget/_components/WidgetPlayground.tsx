'use client';

import { useMemo, useState } from 'react';
import {
  MessageCircle,
  Sparkles,
  Search as SearchIcon,
  Monitor,
  Smartphone,
  LayoutTemplate,
  CircleDot,
  Command,
  Lock,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/shared/ui/custom/PageHeader';
import { useAIExperiences } from '@/app/ai-experiences/_lib/hooks/useAIExperiences';
import {
  useSearchExperiences,
  useSearchExperience,
} from '@/app/search-experiences/_lib/hooks';

// ============================================================================
// CONFIG
// ============================================================================

type WidgetKind = 'chat' | 'search';
type ChatLauncher = 'floating' | 'inline';
type SearchLauncher = 'modal' | 'inline';
type Launcher = ChatLauncher | SearchLauncher;
type Device = 'desktop' | 'mobile';

const CONTAINER_ID: Record<WidgetKind, string> = {
  chat: 'interakt-chat',
  search: 'interakt-search',
};

const GLOBAL_NAME: Record<WidgetKind, string> = {
  chat: 'ChatDropinUI',
  search: 'SearchDropinUI',
};

interface AppliedSpec {
  key: string;
  kind: WidgetKind;
  experienceId: string;
  experienceName: string;
  accessToken: string;
  launcher: Launcher;
  device: Device;
  embed: Record<string, string | undefined>;
}

// ============================================================================
// IFRAME DOCUMENT
// ============================================================================

/**
 * Build the full HTML document for the preview iframe. The script src must be
 * an absolute URL because `srcdoc` iframes resolve relative paths against
 * `about:srcdoc`, not the parent origin.
 */
function buildIframeDoc(spec: AppliedSpec, origin: string): string {
  const scriptUrl = `${origin}/embed/v1/widgets.js`;
  const containerId = CONTAINER_ID[spec.kind];
  const globalName = GLOBAL_NAME[spec.kind];

  // Both widgets share the same theme/branding surface; the launcher key is
  // widget-specific (chat = `launcher`, search = `mode`).
  const initConfig: Record<string, unknown> = {
    containerId,
    accessToken: spec.accessToken,
    theme: spec.embed.widgetTheme,
    primaryColor: spec.embed.primaryColor,
    backgroundColor: spec.embed.backgroundColor,
    surfaceColor: spec.embed.surfaceColor,
    borderRadius: spec.embed.borderRadius,
    fontFamily: spec.embed.fontFamily,
    logoUrl: spec.embed.logoUrl,
  };
  if (spec.kind === 'chat') {
    initConfig.launcher = spec.launcher;
  } else {
    initConfig.mode = spec.launcher;
  }
  const initConfigJson = JSON.stringify(initConfig);

  const isInline = spec.launcher === 'inline';

  // Inline mode renders the widget mid-page; floating/modal attaches a launcher
  // or shortcut to the iframe viewport. Both make sense in this preview.
  const inlineSlot = isInline
    ? `
        <section class="widget-slot">
          <div class="widget-slot__label">${spec.kind === 'chat' ? 'Live chat' : 'Search'}</div>
          <div id="${containerId}"></div>
        </section>`
    : '';

  const trailingMount = !isInline
    ? `<div id="${containerId}" data-floating></div>`
    : '';

  // Search modal is keyboard-triggered (⌘K / Ctrl+K) with no visible launcher,
  // so the hero gets an extra hint nudging the user to try it.
  const searchModalHint =
    spec.kind === 'search' && spec.launcher === 'modal'
      ? `<div class="search-hint">Press <kbd>⌘</kbd> <kbd>K</kbd> (or <kbd>Ctrl</kbd> <kbd>K</kbd>) to open search</div>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Interakt — AI experiences grounded in your data</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #18181b;
      background: linear-gradient(180deg, #fafafa 0%, #f4f4f5 100%);
      min-height: 100vh;
      line-height: 1.5;
    }
    header.site-nav {
      padding: 16px 32px;
      background: rgba(255,255,255,0.85);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid #e4e4e7;
      display: flex; align-items: center; justify-content: space-between;
      position: sticky; top: 0; z-index: 10;
    }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 16px; letter-spacing: -0.01em; }
    .brand .mark {
      width: 24px; height: 24px; border-radius: 7px;
      background: linear-gradient(135deg,#8b5cf6,#6366f1);
      display: inline-flex; align-items: center; justify-content: center;
      color: white; font-size: 13px; font-weight: 800;
    }
    nav.site-links { display: flex; gap: 24px; font-size: 14px; color: #52525b; }
    nav.site-links a { color: inherit; text-decoration: none; cursor: pointer; }
    nav.site-links a:hover { color: #18181b; }
    .cta-btn {
      background: #18181b; color: white; padding: 8px 16px; border-radius: 8px;
      border: 0; font-weight: 600; font-size: 13px; cursor: pointer;
    }
    section.hero { padding: 80px 32px 56px; max-width: 1080px; margin: 0 auto; text-align: center; }
    .eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 6px 12px; border-radius: 999px;
      background: linear-gradient(135deg, #f5f3ff, #ede9fe);
      color: #6d28d9; font-size: 12px; font-weight: 600;
      letter-spacing: 0.02em; margin-bottom: 24px;
      border: 1px solid #ddd6fe;
    }
    .eyebrow .dot { width: 6px; height: 6px; border-radius: 50%; background: #8b5cf6; }
    h1 {
      font-size: 52px; line-height: 1.05; margin: 0 0 20px;
      letter-spacing: -0.03em; font-weight: 700;
      background: linear-gradient(135deg, #18181b 0%, #4c1d95 100%);
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .lead { font-size: 18px; color: #52525b; max-width: 640px; margin: 0 auto 32px; }
    .cta-row { display: inline-flex; gap: 10px; }
    .btn-primary {
      background: #18181b; color: white; padding: 12px 22px; border-radius: 10px;
      border: 0; font-weight: 600; font-size: 14px; cursor: pointer;
    }
    .btn-secondary {
      background: white; border: 1px solid #d4d4d8; color: #18181b; padding: 12px 22px;
      border-radius: 10px; font-weight: 600; font-size: 14px; cursor: pointer;
    }
    .trust-row {
      margin-top: 44px; font-size: 11px; letter-spacing: 0.15em; color: #a1a1aa;
      text-transform: uppercase; font-weight: 600;
    }
    .search-hint {
      margin-top: 28px; font-size: 13px; color: #71717a;
      display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;
      justify-content: center;
    }
    .search-hint kbd {
      background: white; border: 1px solid #d4d4d8; border-bottom-width: 2px;
      border-radius: 6px; padding: 2px 8px; font-family: ui-monospace, monospace;
      font-size: 12px; color: #3f3f46;
    }
    section.widget-slot {
      max-width: 760px; margin: 0 auto 64px; padding: 0 32px;
    }
    .widget-slot__label {
      text-align: center; font-size: 11px; letter-spacing: 0.15em;
      color: #71717a; text-transform: uppercase; margin-bottom: 16px; font-weight: 600;
    }
    section.features {
      padding: 0 32px 88px; max-width: 1080px; margin: 0 auto;
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;
    }
    @media (max-width: 720px) { section.features { grid-template-columns: 1fr; } h1 { font-size: 32px; } section.hero { padding: 48px 24px 32px; } }
    .feature {
      background: white; padding: 24px; border-radius: 14px;
      border: 1px solid #e4e4e7;
    }
    .feature .icon {
      width: 36px; height: 36px; border-radius: 10px;
      background: linear-gradient(135deg, #ede9fe, #ddd6fe);
      margin-bottom: 14px;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 18px;
    }
    .feature h3 { margin: 0 0 6px; font-size: 15px; font-weight: 600; }
    .feature p { margin: 0; font-size: 13px; color: #71717a; }
    footer.site-foot {
      border-top: 1px solid #e4e4e7; background: white; padding: 24px 32px;
      font-size: 12px; color: #71717a; text-align: center;
    }
  </style>
</head>
<body>
  <header class="site-nav">
    <div class="brand"><span class="mark">I</span> Interakt</div>
    <nav class="site-links">
      <a>Product</a><a>Pricing</a><a>Docs</a><a>Blog</a>
    </nav>
    <button class="cta-btn">Book a demo</button>
  </header>

  <section class="hero">
    <div class="eyebrow"><span class="dot"></span> Live preview · ${escapeHtml(spec.experienceName)}</div>
    <h1>AI experiences grounded<br/>in your data</h1>
    <p class="lead">
      Build chat assistants and search experiences that cite every source. Bring any data,
      attach any tool, drop the widget on any page.
    </p>
    <div class="cta-row">
      <button class="btn-primary">Start free</button>
      <button class="btn-secondary">Read the docs</button>
    </div>
    ${searchModalHint}
    <div class="trust-row">Powering AI for SaaS, retail, and B2B teams</div>
  </section>

  ${inlineSlot}

  <section class="features">
    <div class="feature">
      <div class="icon">⚓</div>
      <h3>Grounded by default</h3>
      <p>Every answer cites the document, record, or tool it came from. No hallucinations.</p>
    </div>
    <div class="feature">
      <div class="icon">🔌</div>
      <h3>Any data, any tool</h3>
      <p>Search indexes, file stores, HTTP APIs, and Model Context Protocol servers.</p>
    </div>
    <div class="feature">
      <div class="icon">✨</div>
      <h3>Drop in anywhere</h3>
      <p>One script tag, fully themable. Floating bubble or inline panel — your call.</p>
    </div>
  </section>

  <footer class="site-foot">© 2026 Interakt · demo.interakt.app</footer>

  ${trailingMount}

  <script src="${scriptUrl}"></script>
  <script>
    (function () {
      var poll = setInterval(function () {
        if (window.${globalName} && typeof window.${globalName}.init === 'function') {
          clearInterval(poll);
          try {
            window.${globalName}.init(${initConfigJson});
          } catch (err) {
            var pre = document.createElement('pre');
            pre.style.cssText = 'color:#b91c1c;padding:16px;background:#fef2f2;border-radius:8px;font-family:ui-monospace,monospace;font-size:12px;white-space:pre-wrap;';
            pre.textContent = 'Widget init failed: ' + (err && err.message ? err.message : err);
            document.body.appendChild(pre);
          }
        }
      }, 30);
      setTimeout(function () { clearInterval(poll); }, 10000);
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

// ============================================================================
// LAUNCHER OPTIONS PER WIDGET
// ============================================================================

const LAUNCHER_OPTIONS: Record<
  WidgetKind,
  Array<{ value: Launcher; label: string; icon: React.ComponentType<{ className?: string }> }>
> = {
  chat: [
    { value: 'floating', label: 'Floating', icon: CircleDot },
    { value: 'inline', label: 'Inline', icon: LayoutTemplate },
  ],
  search: [
    { value: 'modal', label: 'Modal (⌘K)', icon: Command },
    { value: 'inline', label: 'Inline', icon: LayoutTemplate },
  ],
};

const DEFAULT_LAUNCHER: Record<WidgetKind, Launcher> = {
  chat: 'floating',
  search: 'modal',
};

// ============================================================================
// COMPONENT
// ============================================================================

export function WidgetPlayground() {
  const [kind, setKind] = useState<WidgetKind>('chat');
  const [selectedId, setSelectedId] = useState<string>('');
  const [launcher, setLauncher] = useState<Launcher>(DEFAULT_LAUNCHER.chat);
  const [device, setDevice] = useState<Device>('desktop');
  const [applied, setApplied] = useState<AppliedSpec | null>(null);

  const aiList = useAIExperiences({ pageSize: 100, isActive: true });
  const searchList = useSearchExperiences({ pageSize: 100, isActive: true });

  // Search list summaries don't include accessToken — fetch the full record
  // when an experience is picked so we can init the widget with it.
  const selectedSearchDetail = useSearchExperience(
    kind === 'search' && selectedId ? selectedId : undefined,
  );

  const isLoadingList = kind === 'chat' ? aiList.isLoading : searchList.isLoading;
  const experiences = kind === 'chat' ? aiList.experiences : searchList.experiences;

  const selectedExperience = experiences.find((e) => e.id === selectedId);

  const dirty = useMemo(() => {
    if (!applied) return false;
    return (
      applied.kind !== kind ||
      applied.experienceId !== selectedId ||
      applied.launcher !== launcher ||
      applied.device !== device
    );
  }, [applied, kind, selectedId, launcher, device]);

  function handleKindChange(next: WidgetKind) {
    if (next === kind) return;
    setKind(next);
    setSelectedId('');
    setLauncher(DEFAULT_LAUNCHER[next]);
  }

  function handleApply() {
    if (!selectedExperience) return;

    if (kind === 'chat') {
      const ai = selectedExperience as (typeof aiList.experiences)[number];
      const embed =
        ((ai.accessConfig as { embedConfig?: Record<string, string | undefined> } | null)
          ?.embedConfig as Record<string, string | undefined>) ?? {};
      setApplied({
        key: `chat:${ai.id}:${launcher}:${device}:${Date.now()}`,
        kind: 'chat',
        experienceId: ai.id,
        experienceName: ai.name,
        accessToken: ai.accessToken,
        launcher,
        device,
        embed,
      });
      return;
    }

    // Search — need the full experience for accessToken.
    const detail = selectedSearchDetail.experience;
    if (!detail) return;
    setApplied({
      key: `search:${detail.id}:${launcher}:${device}:${Date.now()}`,
      kind: 'search',
      experienceId: detail.id,
      experienceName: detail.name,
      accessToken: detail.accessToken,
      launcher,
      device,
      // Search experiences don't carry embedConfig in the DB; theme stays at widget defaults.
      embed: {},
    });
  }

  function handleClear() {
    setApplied(null);
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const iframeDoc = applied ? buildIframeDoc(applied, origin) : null;

  const applyDisabled =
    !selectedExperience ||
    (kind === 'search' && (selectedSearchDetail.isLoading || !selectedSearchDetail.experience));

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8">
      <PageHeader
        variant="hero"
        title="Drop-in Widget Playground"
        description="Render any chat or search experience's drop-in widget inside a realistic customer site preview — same script, same init, same behavior your customers will see."
        icon={MessageCircle}
        iconBg="bg-violet-500/10"
        iconColor="text-violet-500"
      />

      {/* Widget kind tabs */}
      <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Widget
          </label>
          <ToggleGroup
            options={[
              { value: 'chat', label: 'Chat', icon: MessageCircle },
              { value: 'search', label: 'Search', icon: SearchIcon },
            ]}
            value={kind}
            onChange={(v) => handleKindChange(v as WidgetKind)}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {kind === 'chat' ? 'AI Experience' : 'Search Experience'}
            </label>
            <Select value={selectedId} onValueChange={setSelectedId} disabled={isLoadingList}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder={isLoadingList ? 'Loading…' : 'Choose an experience'} />
              </SelectTrigger>
              <SelectContent>
                {experiences.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    No active {kind === 'chat' ? 'AI' : 'search'} experiences yet.
                  </div>
                ) : (
                  experiences.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      <div className="flex items-center gap-2">
                        {kind === 'chat' ? (
                          <Sparkles className="size-3.5 text-violet-500" />
                        ) : (
                          <SearchIcon className="size-3.5 text-blue-500" />
                        )}
                        <span>{e.name}</span>
                        <span className="text-muted-foreground font-mono text-xs">· {e.slug}</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Launcher
            </label>
            <ToggleGroup
              options={LAUNCHER_OPTIONS[kind]}
              value={launcher}
              onChange={(v) => setLauncher(v as Launcher)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Device
            </label>
            <ToggleGroup
              options={[
                { value: 'desktop', label: 'Desktop', icon: Monitor },
                { value: 'mobile', label: 'Mobile', icon: Smartphone },
              ]}
              value={device}
              onChange={(v) => setDevice(v as Device)}
            />
          </div>

          <div className="flex items-center gap-2">
            {applied && (
              <Button variant="outline" onClick={handleClear} className="rounded-xl h-11">
                Clear
              </Button>
            )}
            <Button
              onClick={handleApply}
              disabled={applyDisabled}
              className="rounded-xl h-11 px-6"
            >
              {kind === 'search' && selectedSearchDetail.isLoading && selectedId ? (
                <>
                  <Loader2 className="size-3.5 mr-2 animate-spin" />
                  Loading…
                </>
              ) : dirty ? (
                'Re-apply'
              ) : (
                'Apply'
              )}
            </Button>
          </div>
        </div>

        {selectedExperience && (
          <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-border/40 text-xs">
            {kind === 'chat' ? (
              <Badge variant="outline" className="rounded-md">
                mode: {(selectedExperience as (typeof aiList.experiences)[number]).pipelineMode}
              </Badge>
            ) : (
              <Badge variant="outline" className="rounded-md">
                {(selectedExperience as (typeof searchList.experiences)[number]).indexCount} index
                {(selectedExperience as (typeof searchList.experiences)[number]).indexCount === 1
                  ? ''
                  : 'es'}
              </Badge>
            )}
            <Badge variant="outline" className="rounded-md font-mono">
              {selectedExperience.slug}
            </Badge>
            {applied?.experienceId === selectedExperience.id && !dirty && (
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 rounded-md">
                rendered
              </Badge>
            )}
          </div>
        )}
      </section>

      {/* Browser frame */}
      <BrowserFrame device={applied?.device ?? device}>
        {iframeDoc ? (
          <iframe
            key={applied?.key}
            title="widget-preview"
            srcDoc={iframeDoc}
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
            className="w-full h-full border-0 bg-white"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted/30">
            <div className="text-center text-muted-foreground">
              {kind === 'chat' ? (
                <MessageCircle className="size-12 mx-auto mb-3 opacity-40" />
              ) : (
                <SearchIcon className="size-12 mx-auto mb-3 opacity-40" />
              )}
              <p className="text-sm">Pick an experience and click Apply.</p>
              <p className="text-xs mt-1">The widget will render inside a mock customer site.</p>
            </div>
          </div>
        )}
      </BrowserFrame>
    </div>
  );
}

// ============================================================================
// BROWSER CHROME
// ============================================================================

function BrowserFrame({ device, children }: { device: Device; children: React.ReactNode }) {
  const isMobile = device === 'mobile';
  return (
    <div className="rounded-2xl border border-border/60 bg-zinc-100 dark:bg-zinc-900 shadow-sm overflow-hidden">
      {/* Chrome */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-zinc-200/60 dark:bg-zinc-800/60 border-b border-border/40">
        <div className="flex gap-1.5">
          <div className="size-3 rounded-full bg-red-400" />
          <div className="size-3 rounded-full bg-yellow-400" />
          <div className="size-3 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 mx-2">
          <div className="flex items-center gap-2 bg-white dark:bg-zinc-700 rounded-md px-3 py-1 text-xs text-muted-foreground font-mono w-fit mx-auto max-w-md">
            <Lock className="size-3" />
            {isMobile ? 'm.demo.interakt.app' : 'demo.interakt.app'}
          </div>
        </div>
        <div className="w-[60px]" />
      </div>

      {/* Viewport */}
      <div className="bg-white dark:bg-zinc-950 flex justify-center">
        <div
          className={`transition-all duration-300 ${
            isMobile
              ? 'w-[390px] h-[720px] border-x border-zinc-200 dark:border-zinc-800'
              : 'w-full h-[760px]'
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TOGGLE GROUP
// ============================================================================

function ToggleGroup({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string; icon: React.ComponentType<{ className?: string }> }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex h-11 items-center rounded-xl border border-border/50 bg-muted/30 p-1 w-full">
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="size-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
