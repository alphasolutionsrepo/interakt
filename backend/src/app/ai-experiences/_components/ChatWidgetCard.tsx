'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Code2,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Save,
  Plus,
  X,
  MessageSquare,
  Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import type {
  AccessConfigPatch,
  EmbedConfig,
  Launcher,
  Placement,
  Theme,
} from './embed-config-types';
import { readAccessConfig, mergeEmbedConfig } from './embed-config-types';

interface ChatWidgetCardProps {
  accessToken: string;
  accessConfig: Record<string, unknown> | null;
  onSave: (next: AccessConfigPatch) => Promise<void>;
  isSaving?: boolean;
  defaultContainerId?: string;
  defaultOpen?: boolean;
}

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
 * Unified Chat Widget configuration. One card, one save button, snippet at
 * the top with two clearly-labelled sections below:
 *   • Content — shared by drop-in widget and direct API consumers (served
 *     through widget-config at runtime; not baked into the snippet).
 *   • Drop-in Styling — only applies to the embed bundle (baked into the
 *     snippet for every new copy).
 *
 * Every field live-updates the snippet preview; Save persists all of them
 * to `embedConfig` at once.
 */
export function ChatWidgetCard({
  accessToken,
  accessConfig,
  onSave,
  isSaving,
  defaultContainerId,
  defaultOpen = false,
}: ChatWidgetCardProps) {
  const normalized = useMemo(() => readAccessConfig(accessConfig), [accessConfig]);
  const embed = normalized.embedConfig ?? {};

  // Content fields
  const [welcomeMessage, setWelcomeMessage] = useState<string>(embed.welcomeMessage ?? '');
  const [welcomeDescription, setWelcomeDescription] = useState<string>(embed.welcomeDescription ?? '');
  const [placeholder, setPlaceholder] = useState<string>(embed.placeholder ?? '');
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>(embed.suggestedQuestions ?? []);
  const [sqInput, setSqInput] = useState('');

  // Drop-in styling fields
  const [theme, setTheme] = useState<Theme>(embed.widgetTheme ?? 'auto');
  const [launcher, setLauncher] = useState<Launcher>(embed.launcher ?? 'floating');
  const [placement, setPlacement] = useState<Placement>(embed.placement ?? 'bottom-right');
  const [primaryColor, setPrimaryColor] = useState<string>(embed.primaryColor ?? '');
  const [backgroundColor, setBackgroundColor] = useState<string>(embed.backgroundColor ?? '');
  const [surfaceColor, setSurfaceColor] = useState<string>(embed.surfaceColor ?? '');
  const [borderRadius, setBorderRadius] = useState<string>(embed.borderRadius ?? '');
  const [fontFamily, setFontFamily] = useState<string>(embed.fontFamily ?? '');
  const [logoUrl, setLogoUrl] = useState<string>(embed.logoUrl ?? '');
  const [showBranding, setShowBranding] = useState<boolean>(embed.showBranding !== false);

  // Container ID (round-trips via the /embed-snippet query so the server resolves
  // the snippet's scriptUrl/experience name on first mount).
  const [containerId, setContainerId] = useState(defaultContainerId ?? '');

  // Re-seed when server-persisted accessConfig changes (after a Save, or props change).
  useEffect(() => {
    setWelcomeMessage(embed.welcomeMessage ?? '');
    setWelcomeDescription(embed.welcomeDescription ?? '');
    setPlaceholder(embed.placeholder ?? '');
    setSuggestedQuestions(embed.suggestedQuestions ?? []);
    setTheme(embed.widgetTheme ?? 'auto');
    setLauncher(embed.launcher ?? 'floating');
    setPlacement(embed.placement ?? 'bottom-right');
    setPrimaryColor(embed.primaryColor ?? '');
    setBackgroundColor(embed.backgroundColor ?? '');
    setSurfaceColor(embed.surfaceColor ?? '');
    setBorderRadius(embed.borderRadius ?? '');
    setFontFamily(embed.fontFamily ?? '');
    setLogoUrl(embed.logoUrl ?? '');
    setShowBranding(embed.showBranding !== false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessConfig]);

  // Resolve scriptUrl + experienceName from the server once.
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

  // Live preview uses the shared builder so it matches server output exactly.
  const rendered = useMemo(() => {
    if (state.status !== 'ok') return null;
    const snippet = state.snippet;
    const brandingDraft: EmbedBrandingConfig = {
      widgetTheme: theme,
      launcher,
      placement,
      primaryColor: primaryColor || undefined,
      backgroundColor: backgroundColor || undefined,
      surfaceColor: surfaceColor || undefined,
      borderRadius: borderRadius || undefined,
      fontFamily: fontFamily || undefined,
      logoUrl: logoUrl || undefined,
    };
    return buildEmbedSnippet({
      widget: snippet.widget,
      scriptUrl: snippet.scriptUrl,
      containerId: snippet.containerId,
      accessToken,
      experienceName: snippet.experienceName,
      embedConfig: brandingDraft,
    });
  }, [state, theme, launcher, placement, primaryColor, backgroundColor, surfaceColor, borderRadius, fontFamily, logoUrl, accessToken]);

  const isDirty = useMemo(() => (
    welcomeMessage !== (embed.welcomeMessage ?? '') ||
    welcomeDescription !== (embed.welcomeDescription ?? '') ||
    placeholder !== (embed.placeholder ?? '') ||
    JSON.stringify(suggestedQuestions) !== JSON.stringify(embed.suggestedQuestions ?? []) ||
    theme !== (embed.widgetTheme ?? 'auto') ||
    launcher !== (embed.launcher ?? 'floating') ||
    placement !== (embed.placement ?? 'bottom-right') ||
    primaryColor !== (embed.primaryColor ?? '') ||
    backgroundColor !== (embed.backgroundColor ?? '') ||
    surfaceColor !== (embed.surfaceColor ?? '') ||
    borderRadius !== (embed.borderRadius ?? '') ||
    fontFamily !== (embed.fontFamily ?? '') ||
    logoUrl !== (embed.logoUrl ?? '') ||
    showBranding !== (embed.showBranding !== false)
  ), [welcomeMessage, welcomeDescription, placeholder, suggestedQuestions, theme, launcher, placement, primaryColor, backgroundColor, surfaceColor, borderRadius, fontFamily, logoUrl, showBranding, embed]);

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

  const addSuggestion = () => {
    const q = sqInput.trim();
    if (!q || suggestedQuestions.length >= 5 || suggestedQuestions.includes(q)) return;
    setSuggestedQuestions((prev) => [...prev, q]);
    setSqInput('');
  };

  const handleSave = async () => {
    const patch: EmbedConfig = {
      widgetTheme: theme,
      launcher,
      placement,
      showBranding,
      widgetPosition:
        launcher === 'inline'
          ? 'inline'
          : placement === 'bottom-left'
            ? 'bottom-left'
            : 'bottom-right',
      ...(primaryColor ? { primaryColor } : { primaryColor: undefined }),
      ...(backgroundColor ? { backgroundColor } : { backgroundColor: undefined }),
      ...(surfaceColor ? { surfaceColor } : { surfaceColor: undefined }),
      ...(borderRadius ? { borderRadius } : { borderRadius: undefined }),
      ...(fontFamily ? { fontFamily } : { fontFamily: undefined }),
      ...(logoUrl ? { logoUrl } : { logoUrl: undefined }),
      ...(welcomeMessage ? { welcomeMessage } : { welcomeMessage: undefined }),
      ...(welcomeDescription ? { welcomeDescription } : { welcomeDescription: undefined }),
      ...(placeholder ? { placeholder } : { placeholder: undefined }),
      suggestedQuestions: suggestedQuestions.length > 0 ? suggestedQuestions : undefined,
    };
    await onSave(mergeEmbedConfig(normalized, patch));
  };

  return (
    <CollapsibleCard
      defaultOpen={defaultOpen}
      icon={<MessageSquare className="size-4 text-primary" />}
      title="Chat Widget"
      description="All the settings for how visitors experience this chat — content, drop-in styling, and the embed snippet."
      headerExtras={
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
          <Button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            size="sm"
            className="rounded-xl"
          >
            {isSaving ? <Loader2 className="size-3.5 mr-2 animate-spin" /> : <Save className="size-3.5 mr-2" />}
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* ─── Embed snippet — the thing admins actually copy ─── */}
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
              placeholder="interakt-chat"
              className="flex-1 h-8 rounded-lg border bg-background px-3 text-xs font-mono"
            />
          </div>
        </section>

        {/* ─── Content — shared with any consumer ─── */}
        <section className="space-y-3 pt-4 border-t border-border/60">
          <div>
            <h4 className="text-sm font-semibold">Content</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Served through <code className="text-[11px]">/api/v1/ai-experiences/widget-config</code>. Any
              consumer (drop-in widget or your own API integration) picks these up. Admin edits take effect
              immediately on already-embedded widgets.
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Welcome Message</Label>
              <Input
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                placeholder="How can I help you today?"
                className="rounded-xl"
                maxLength={500}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Welcome Description</Label>
              <Input
                value={welcomeDescription}
                onChange={(e) => setWelcomeDescription(e.target.value)}
                placeholder="I can search products, compare options, and answer questions."
                className="rounded-xl"
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label>Suggested Questions</Label>
              <div className="flex gap-2">
                <Input
                  value={sqInput}
                  onChange={(e) => setSqInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSuggestion();
                    }
                  }}
                  placeholder="e.g. Show me winter jackets"
                  className="rounded-xl flex-1"
                  maxLength={200}
                  disabled={suggestedQuestions.length >= 5}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl gap-1"
                  disabled={suggestedQuestions.length >= 5 || !sqInput.trim()}
                  onClick={addSuggestion}
                >
                  <Plus className="size-4" />
                  Add
                </Button>
              </div>
              {suggestedQuestions.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {suggestedQuestions.map((q, i) => (
                    <Badge key={`${q}-${i}`} variant="secondary" className="rounded-lg px-2.5 py-1 text-xs gap-1.5">
                      {q}
                      <button
                        type="button"
                        onClick={() => setSuggestedQuestions((prev) => prev.filter((_, j) => j !== i))}
                        className="hover:text-destructive"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No suggestions — default chips will be shown. Max 5.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Input Placeholder</Label>
              <Input
                value={placeholder}
                onChange={(e) => setPlaceholder(e.target.value)}
                placeholder="Ask anything..."
                className="rounded-xl"
                maxLength={200}
              />
            </div>
          </div>
        </section>

        {/* ─── Drop-in Styling — only applies to the embed bundle ─── */}
        <section className="space-y-3 pt-4 border-t border-border/60">
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Palette className="size-3.5 text-muted-foreground" />
              Drop-in Styling
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Applies only to the drop-in widget. <strong>Baked into the embed snippet</strong> above —
              changes here only affect newly copied snippets. Direct API consumers ignore these fields.
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Launcher</Label>
              <Select value={launcher} onValueChange={(v) => setLauncher(v as Launcher)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="floating">Floating bubble</SelectItem>
                  <SelectItem value="inline">Inline (fills container)</SelectItem>
                  <SelectItem value="button">Headless (host wires their own trigger)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Placement</Label>
              <Select
                value={placement}
                onValueChange={(v) => setPlacement(v as Placement)}
                disabled={launcher !== 'floating'}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom-right">Bottom right</SelectItem>
                  <SelectItem value="bottom-left">Bottom left</SelectItem>
                  <SelectItem value="top-right">Top right</SelectItem>
                  <SelectItem value="top-left">Top left</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
              <Label>Surface (inputs, bubbles)</Label>
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

          <div className="space-y-1.5">
            <Label>Logo URL</Label>
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://cdn.example.com/logo.svg"
              className="rounded-xl"
              maxLength={2048}
              type="url"
            />
            <p className="text-[11px] text-muted-foreground">Shown in the chat header beside the title. Square images at ~32px render best.</p>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
            <div>
              <Label className="text-sm font-medium">Show &quot;Powered by Interakt&quot;</Label>
              <p className="text-xs text-muted-foreground">Attribution footer inside the widget.</p>
            </div>
            <Switch checked={showBranding} onCheckedChange={setShowBranding} />
          </div>
        </section>
      </div>
    </CollapsibleCard>
  );
}
