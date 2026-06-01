import type { Theme } from './types';

export interface ResolvedTheme {
  /** CSS custom properties to set on the widget root. */
  cssVars: Record<string, string | undefined>;
  /** Theme mode that was resolved (never 'auto'). */
  mode: 'light' | 'dark';
}

const LIGHT = {
  '--ik-bg': '#ffffff',
  '--ik-fg': '#0f172a',
  '--ik-muted': '#64748b',
  '--ik-border': '#e2e8f0',
  '--ik-surface': '#f8fafc',
  '--ik-primary': '#2563eb',
  '--ik-primary-fg': '#ffffff',
  '--ik-shadow': '0 10px 30px rgba(15, 23, 42, 0.18)',
};

const DARK = {
  '--ik-bg': '#0f172a',
  '--ik-fg': '#f1f5f9',
  '--ik-muted': '#94a3b8',
  '--ik-border': '#1f2a44',
  '--ik-surface': '#111c33',
  '--ik-primary': '#60a5fa',
  '--ik-primary-fg': '#0b1220',
  '--ik-shadow': '0 10px 30px rgba(0, 0, 0, 0.45)',
};

function prefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Overrides a host can supply to brand the widget beyond primaryColor. */
export interface ThemeOverrides {
  primaryColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  borderRadius?: string;
  fontFamily?: string;
}

const DEFAULT_RADIUS = '12px';
const DEFAULT_FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function resolveTheme(
  theme: Theme | undefined,
  overrides: ThemeOverrides | undefined,
): ResolvedTheme {
  const requested = theme ?? 'auto';
  const mode: 'light' | 'dark' =
    requested === 'dark'
      ? 'dark'
      : requested === 'light'
        ? 'light'
        : prefersDark()
          ? 'dark'
          : 'light';

  const base = mode === 'dark' ? DARK : LIGHT;
  const cssVars: Record<string, string | undefined> = { ...base };

  if (overrides?.primaryColor) {
    cssVars['--ik-primary'] = overrides.primaryColor;
    // Auto-contrast the text/icons that sit on the primary color so the
    // header stays readable for arbitrary brand colors (e.g. yellow brands
    // shouldn't render white-on-yellow).
    cssVars['--ik-primary-fg'] = readableForeground(overrides.primaryColor);
  }
  if (overrides?.backgroundColor) {
    cssVars['--ik-bg'] = overrides.backgroundColor;
  }
  if (overrides?.surfaceColor) {
    cssVars['--ik-surface'] = overrides.surfaceColor;
  }

  cssVars['--ik-radius'] = overrides?.borderRadius ?? DEFAULT_RADIUS;
  cssVars['--ik-font'] = overrides?.fontFamily ?? DEFAULT_FONT;

  return { cssVars, mode };
}

/**
 * Pick black or white for text sitting on top of the given color, using
 * sRGB relative luminance. Accepts #RGB / #RRGGBB hex; falls back to white
 * for anything unparseable so callers never break.
 */
function readableForeground(color: string): string {
  const rgb = parseHex(color);
  if (!rgb) return '#ffffff';
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? '#0b1220' : '#ffffff';
}

function parseHex(color: string): [number, number, number] | null {
  const m = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const hex = m[1];
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}
