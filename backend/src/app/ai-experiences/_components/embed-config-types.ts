/**
 * Shared types + helpers for the Welcome & Content and Drop-in Widget
 * cards on the AI experience detail page. Both cards write into the same
 * `accessConfig.embedConfig` blob, so save handlers merge rather than
 * replace.
 */

export type Theme = 'light' | 'dark' | 'auto';
export type Launcher = 'floating' | 'inline' | 'button';
export type Placement = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface EmbedConfig {
  widgetTheme?: Theme;
  /** @deprecated use launcher + placement */
  widgetPosition?: 'bottom-right' | 'bottom-left' | 'inline';
  launcher?: Launcher;
  placement?: Placement;
  primaryColor?: string;
  /** Panel background override. */
  backgroundColor?: string;
  /** Input / assistant-bubble background override. */
  surfaceColor?: string;
  /** CSS length for corner radius, e.g. "12px" or "0". */
  borderRadius?: string;
  /** Font stack. Any valid CSS font-family value. */
  fontFamily?: string;
  /** Small logo shown in the chat header. */
  logoUrl?: string;
  welcomeMessage?: string;
  welcomeDescription?: string;
  suggestedQuestions?: string[];
  placeholder?: string;
  showBranding?: boolean;
}

export interface AccessConfigPatch {
  allowedOrigins?: string[];
  rateLimits?: { chatPerMinute?: number; requestsPerDay?: number };
  embedConfig?: EmbedConfig;
}

/**
 * Decode accessConfig (stored as JSON) into typed fields. Loose casts are
 * unavoidable — the backing column is a JSONB with no runtime schema.
 */
export function readAccessConfig(ac: Record<string, unknown> | null): AccessConfigPatch {
  if (!ac) return {};
  return {
    allowedOrigins: Array.isArray(ac.allowedOrigins) ? (ac.allowedOrigins as string[]) : [],
    rateLimits: (ac.rateLimits as AccessConfigPatch['rateLimits']) ?? undefined,
    embedConfig: (ac.embedConfig as EmbedConfig | undefined) ?? {},
  };
}

/**
 * Merge a partial embedConfig update into the existing accessConfig,
 * preserving siblings (allowedOrigins, rateLimits) that the server would
 * otherwise wipe on replace. Use this in each card's save handler.
 */
export function mergeEmbedConfig(
  current: AccessConfigPatch,
  embedPatch: EmbedConfig,
): AccessConfigPatch {
  const existingEmbed = current.embedConfig ?? {};
  const merged = { ...existingEmbed, ...embedPatch };

  // Strip explicit `undefined` so we don't persist empty-string noise.
  for (const k of Object.keys(merged) as Array<keyof EmbedConfig>) {
    if (merged[k] === undefined) {
      delete merged[k];
    }
  }

  return {
    allowedOrigins: current.allowedOrigins ?? [],
    rateLimits: current.rateLimits ?? { chatPerMinute: 60, requestsPerDay: 10000 },
    embedConfig: merged,
  };
}
