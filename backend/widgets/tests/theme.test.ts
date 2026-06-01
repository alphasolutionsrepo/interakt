import { describe, it, expect } from 'vitest';
import { resolveTheme } from '../src/shared/theme';

describe('resolveTheme', () => {
  it('returns dark mode when explicitly requested', () => {
    const resolved = resolveTheme('dark', undefined);
    expect(resolved.mode).toBe('dark');
    expect(resolved.cssVars['--ik-bg']).toBeDefined();
  });

  it('lets caller primaryColor override the theme default', () => {
    const resolved = resolveTheme('light', { primaryColor: '#ff00aa' });
    expect(resolved.cssVars['--ik-primary']).toBe('#ff00aa');
  });

  it('auto-contrasts primary-fg to dark text on a light primary color', () => {
    const resolved = resolveTheme('light', { primaryColor: '#ffee00' });
    expect(resolved.cssVars['--ik-primary-fg']).toBe('#0b1220');
  });

  it('auto-contrasts primary-fg to white text on a dark primary color', () => {
    const resolved = resolveTheme('light', { primaryColor: '#1a1a1a' });
    expect(resolved.cssVars['--ik-primary-fg']).toBe('#ffffff');
  });

  it('applies background, surface, radius, and font overrides', () => {
    const resolved = resolveTheme('light', {
      backgroundColor: '#fafafa',
      surfaceColor: '#eeeeee',
      borderRadius: '0',
      fontFamily: 'Inter, sans-serif',
    });
    expect(resolved.cssVars['--ik-bg']).toBe('#fafafa');
    expect(resolved.cssVars['--ik-surface']).toBe('#eeeeee');
    expect(resolved.cssVars['--ik-radius']).toBe('0');
    expect(resolved.cssVars['--ik-font']).toBe('Inter, sans-serif');
  });

  it('uses default radius + font when overrides are omitted', () => {
    const resolved = resolveTheme('light', undefined);
    expect(resolved.cssVars['--ik-radius']).toBe('12px');
    expect(resolved.cssVars['--ik-font']).toContain('system-ui');
  });
});
