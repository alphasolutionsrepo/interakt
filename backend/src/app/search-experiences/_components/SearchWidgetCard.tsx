'use client';

import { useEffect, useMemo, useState } from 'react';
import { Code2, Copy, Check, Loader2, AlertCircle, Palette, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { CollapsibleCard } from '@/shared/ui/custom/CollapsibleCard';
import {
  buildEmbedSnippet,
  type EmbedBrandingConfig,
  type Widget,
} from '@/features/embed/build-snippet';

interface SearchWidgetCardProps {
  accessToken: string;
  defaultContainerId?: string;
  defaultOpen?: boolean;
}

type Theme = 'light' | 'dark' | 'auto';
type Mode = 'modal' | 'inline';

interface ServerPayload {
  widget: Widget;
  experienceName: string;
  scriptUrl: string;
  containerId: string;
  globalName: string;
  html: string;
}

type FetchState =
  | { status: 'loading' }
  | { status: 'ok'; snippet: ServerPayload }
  | { status: 'error'; error: string };

/**
 * Search Widget — UI-only configurator for the drop-in search bundle.
 *
 * Search experiences don't carry an `embedConfig` in the database, so
 * there's nothing to persist. Settings live only in this component's
 * state; admins tweak them, copy the resulting snippet, and paste it into
 * their site. The snippet is self-contained, so each copy captures the
 * chosen options independently.
 *
 * Chat has a parallel ChatWidgetCard that persists to the experience's
 * embedConfig — that one has to survive across admin sessions because the
 * widget-config endpoint also serves its content. Search has no such
 * runtime config, so persistence would be noise.
 */
export function SearchWidgetCard({
  accessToken,
  defaultContainerId,
  defaultOpen = false,
}: SearchWidgetCardProps) {
  // UI-only settings — no DB round-trip.
  const [theme, setTheme] = useState<Theme>('auto');
  const [primaryColor, setPrimaryColor] = useState<string>('');
  const [backgroundColor, setBackgroundColor] = useState<string>('');
  const [surfaceColor, setSurfaceColor] = useState<string>('');
  const [borderRadius, setBorderRadius] = useState<string>('');
  const [fontFamily, setFontFamily] = useState<string>('');
  const [mode, setMode] = useState<Mode>('modal');
  const [containerId, setContainerId] = useState(defaultContainerId ?? '');

  // Resolve scriptUrl + experienceName from the server (once).
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    const ac = new AbortController();
    setState({ status: 'loading' });

    const url = new URL('/api/v1/embed-snippet', window.location.origin);
    if (containerId) url.searchParams.set('containerId', containerId);

    fetch(url.toString(), {
      method: 'GET',
      headers: { 'X-Access-Token': accessToken },
      signal: ac.signal,
      credentials: 'omit',
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const body = await res.json();
        return body?.data as ServerPayload;
      })
      .then((snippet) => setState({ status: 'ok', snippet }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ status: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
      });

    return () => ac.abort();
  }, [accessToken, containerId]);

  const rendered = useMemo(() => {
    if (state.status !== 'ok') return null;
    const snippet = state.snippet;
    const brandingDraft: EmbedBrandingConfig = {
      widgetTheme: theme,
      mode,
      primaryColor: primaryColor || undefined,
      backgroundColor: backgroundColor || undefined,
      surfaceColor: surfaceColor || undefined,
      borderRadius: borderRadius || undefined,
      fontFamily: fontFamily || undefined,
    };
    return buildEmbedSnippet({
      widget: snippet.widget,
      scriptUrl: snippet.scriptUrl,
      containerId: snippet.containerId,
      accessToken,
      experienceName: snippet.experienceName,
      embedConfig: brandingDraft,
    });
  }, [state, theme, mode, primaryColor, backgroundColor, surfaceColor, borderRadius, fontFamily, accessToken]);

  const handleCopy = async () => {
    if (!rendered) return;
    try {
      await navigator.clipboard.writeText(rendered);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <CollapsibleCard
      defaultOpen={defaultOpen}
      icon={<Search className="size-4 text-blue-500" />}
      title="Search Widget"
      description="Configure and copy the embed snippet for the drop-in search widget. Settings here are UI-only — the snippet itself captures every choice."
      headerExtras={
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={handleCopy}
          disabled={!rendered}
        >
          {copied ? <Check className="h-3.5 w-3.5 mr-2" /> : <Copy className="h-3.5 w-3.5 mr-2" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      }
    >
      <div className="space-y-6">
        {/* ─── Embed snippet ─── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-indigo-500" />
            <h4 className="text-sm font-semibold">Embed code</h4>
          </div>

          {state.status === 'loading' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-4 border border-border/50">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Building snippet…
            </div>
          )}

          {state.status === 'error' && (
            <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-900">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div>
                Could not load snippet: <span className="font-mono">{state.error}</span>
              </div>
            </div>
          )}

          {rendered && (
            <pre className="text-xs bg-slate-900 dark:bg-slate-950 text-slate-100 rounded-lg p-4 overflow-x-auto border border-slate-800">
              <code>{rendered}</code>
            </pre>
          )}

          <div className="flex items-center gap-2">
            <label htmlFor="embed-container-id" className="text-xs font-medium text-muted-foreground shrink-0">
              Target element ID
            </label>
            <input
              id="embed-container-id"
              value={containerId}
              onChange={(e) => setContainerId(e.target.value)}
              placeholder="interakt-search"
              className="flex-1 h-8 rounded-lg border bg-background px-3 text-xs font-mono"
            />
          </div>
        </section>

        {/* ─── Drop-in Styling ─── */}
        <section className="space-y-3 pt-4 border-t border-border/60">
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Palette className="size-3.5 text-muted-foreground" />
              Drop-in Styling
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Changes update the snippet above live. Paste the resulting snippet into any page.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Theme</Label>
              <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (match visitor&apos;s OS)</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Primary Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor || '#2563eb'}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-12 rounded-lg border border-input cursor-pointer bg-background p-0.5"
                  aria-label="Primary color"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#2563eb"
                  className="rounded-xl flex-1"
                  maxLength={32}
                />
                {primaryColor && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPrimaryColor('')} className="rounded-xl">
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="modal">Modal (⌘K opens anywhere)</SelectItem>
                <SelectItem value="inline">Inline (fills the container)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {mode === 'modal'
                ? 'Widget floats over the page, triggered by the ⌘K / Ctrl+K shortcut.'
                : 'Widget renders expanded inside the container div as a search bar + result list.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Panel background</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={backgroundColor || '#ffffff'}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="h-9 w-12 rounded-lg border border-input cursor-pointer bg-background p-0.5"
                  aria-label="Background color"
                />
                <Input
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  placeholder="Theme default"
                  className="rounded-xl flex-1"
                  maxLength={32}
                />
                {backgroundColor && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setBackgroundColor('')} className="rounded-xl">
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Surface (inputs, rows)</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={surfaceColor || '#f8fafc'}
                  onChange={(e) => setSurfaceColor(e.target.value)}
                  className="h-9 w-12 rounded-lg border border-input cursor-pointer bg-background p-0.5"
                  aria-label="Surface color"
                />
                <Input
                  value={surfaceColor}
                  onChange={(e) => setSurfaceColor(e.target.value)}
                  placeholder="Theme default"
                  className="rounded-xl flex-1"
                  maxLength={32}
                />
                {surfaceColor && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSurfaceColor('')} className="rounded-xl">
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Corner radius</Label>
              <Input
                value={borderRadius}
                onChange={(e) => setBorderRadius(e.target.value)}
                placeholder="12px"
                className="rounded-xl"
                maxLength={16}
              />
              <p className="text-[11px] text-muted-foreground">CSS length — e.g. <code>12px</code>, <code>0</code>, <code>1rem</code>.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Font family</Label>
              <Input
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                placeholder="system-ui, sans-serif"
                className="rounded-xl"
                maxLength={256}
              />
              <p className="text-[11px] text-muted-foreground">Any CSS font-family stack. Leave blank for defaults.</p>
            </div>
          </div>
        </section>
      </div>
    </CollapsibleCard>
  );
}
