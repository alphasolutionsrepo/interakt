/** The browser facts the shortcut label reads; `userAgentData` is the newer source where the browser has it. */
export interface PlatformSource {
  platform?: string;
  userAgentData?: { platform?: string };
}

/**
 * The open-search shortcut as this visitor's keyboard shows it: ⌘K on Apple devices,
 * Ctrl+K elsewhere. Both keys open the search on every platform; this only picks the label.
 */
export function searchShortcutLabel(
  nav: PlatformSource | undefined = typeof navigator === 'undefined' ? undefined : navigator,
): string {
  const platform = nav?.userAgentData?.platform || nav?.platform || '';
  return /mac|iphone|ipad/i.test(platform) ? '⌘K' : 'Ctrl+K';
}
