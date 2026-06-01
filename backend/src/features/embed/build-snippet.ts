// Shared snippet builder — used by both the API route that serves the
// canonical snippet and the admin UI's live preview. Extracting it keeps
// the two in lockstep so the admin preview matches what customers paste
// byte-for-byte.
//
// Pure function with no server-only imports so it's safe to use in client
// components.

export type Widget = 'chat' | 'search';

export const GLOBAL_NAME: Record<Widget, string> = {
  chat: 'ChatDropinUI',
  search: 'SearchDropinUI',
};

export const DEFAULT_CONTAINER_ID: Record<Widget, string> = {
  chat: 'interakt-chat',
  search: 'interakt-search',
};

/**
 * Widget defaults — only bake a field into the snippet when the admin's
 * value differs from these. Keeps the copy-paste output minimal.
 */
export const WIDGET_DEFAULTS = {
  theme: 'auto',
  launcher: 'floating',
  placement: 'bottom-right',
  mode: 'modal',
} as const;

/** Subset of EmbedConfig that actually shapes the init() call. */
export interface EmbedBrandingConfig {
  // Shared
  widgetTheme?: string;
  primaryColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  borderRadius?: string;
  fontFamily?: string;
  logoUrl?: string;
  // Chat-specific
  launcher?: string;
  placement?: string;
  // Search-specific
  mode?: string;
}

export interface BuildSnippetInput {
  widget: Widget;
  scriptUrl: string;
  containerId: string;
  accessToken: string;
  experienceName: string;
  embedConfig?: EmbedBrandingConfig;
}

/**
 * Build the init() key/value pairs. Required fields (containerId,
 * accessToken) are always included; admin-tuned fields are added only when
 * they differ from widget defaults.
 */
export function buildInitPairs(
  input: Omit<BuildSnippetInput, 'widget' | 'scriptUrl' | 'experienceName'>,
): Array<[string, string]> {
  const { containerId, accessToken, embedConfig = {} } = input;
  const pairs: Array<[string, string]> = [
    ['containerId', quote(containerId)],
    ['accessToken', quote(accessToken)],
  ];

  // Shared fields — apply to both chat and search widgets.
  if (embedConfig.widgetTheme && embedConfig.widgetTheme !== WIDGET_DEFAULTS.theme) {
    pairs.push(['theme', quote(embedConfig.widgetTheme)]);
  }
  if (embedConfig.primaryColor) {
    pairs.push(['primaryColor', quote(embedConfig.primaryColor)]);
  }
  if (embedConfig.backgroundColor) {
    pairs.push(['backgroundColor', quote(embedConfig.backgroundColor)]);
  }
  if (embedConfig.surfaceColor) {
    pairs.push(['surfaceColor', quote(embedConfig.surfaceColor)]);
  }
  if (embedConfig.borderRadius) {
    pairs.push(['borderRadius', quote(embedConfig.borderRadius)]);
  }
  if (embedConfig.fontFamily) {
    pairs.push(['fontFamily', quote(embedConfig.fontFamily)]);
  }
  if (embedConfig.logoUrl) {
    pairs.push(['logoUrl', quote(embedConfig.logoUrl)]);
  }

  // Chat-specific fields.
  if (embedConfig.launcher && embedConfig.launcher !== WIDGET_DEFAULTS.launcher) {
    pairs.push(['launcher', quote(embedConfig.launcher)]);
  }
  const effectiveLauncher = embedConfig.launcher ?? WIDGET_DEFAULTS.launcher;
  if (
    effectiveLauncher === 'floating' &&
    embedConfig.placement &&
    embedConfig.placement !== WIDGET_DEFAULTS.placement
  ) {
    pairs.push(['placement', quote(embedConfig.placement)]);
  }

  // Search-specific fields.
  if (embedConfig.mode && embedConfig.mode !== WIDGET_DEFAULTS.mode) {
    pairs.push(['mode', quote(embedConfig.mode)]);
  }

  return pairs;
}

export function buildEmbedSnippet(input: BuildSnippetInput): string {
  const { widget, scriptUrl, containerId, accessToken, experienceName } = input;
  const pairs = buildInitPairs({ containerId, accessToken, embedConfig: input.embedConfig });
  const initBody = pairs.map(([k, v]) => `    ${k}: ${v},`).join('\n');

  return `<!-- Interakt ${widget} widget for "${experienceName}" -->
<div id="${containerId}"></div>

<script src="${scriptUrl}"></script>

<script>
  window.${GLOBAL_NAME[widget]}.init({
${initBody}
  });
</script>`;
}

/** JSON.stringify handles escaping safely for string values inlined into JS. */
function quote(value: string): string {
  return JSON.stringify(value);
}
