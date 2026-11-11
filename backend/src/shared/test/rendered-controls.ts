// src/shared/test/rendered-controls.ts

/**
 * Reading buttons and menu items out of server-rendered HTML in component tests: their text,
 * and whether each is usable, disabled for its own reason, or locked (inside the lock hint of
 * shared/access/ActionControls.tsx, disabled, with the lock icon).
 */

export type ControlState = 'open' | 'disabled' | 'locked' | 'missing';

/** The visible text of an HTML fragment: tags removed (repeatedly, so none can survive). */
export function textOf(html: string): string {
  let text = html;
  for (let previous = ''; previous !== text;) {
    previous = text;
    text = text.replace(/<[^<>]*>/g, '');
  }
  return text.replace(/[<>]/g, '').trim();
}

/** Text only screen readers get (a locked item's reason), left out of a label. */
const withoutScreenReaderText = (html: string) => html.replace(/<span class="sr-only">[^<]*<\/span>/g, '');

/** Each menu item as "label", or "label (locked)" when locked. */
export function menuItems(html: string): string[] {
  return [...html.matchAll(/<button[^>]*role="menuitem"([^>]*)>(.*?)<\/button>/g)]
    .map(([, attrs, inner]) => `${textOf(withoutScreenReaderText(inner))}${attrs.includes('disabled') && inner.includes('lucide-lock') ? ' (locked)' : ''}`);
}

/** What a screen reader hears for each locked menu item: its reason, read out inside the item. */
export function lockedMenuReasons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*role="menuitem"[^>]*aria-disabled="true"[^>]*>(.*?)<\/button>/g)]
    .flatMap(([, inner]) => [...inner.matchAll(/<span class="sr-only">\. ([^<]*)<\/span>/g)].map(([, reason]) => reason));
}

/**
 * The state of the first button whose text is `text`, starts with `textStartsWith` (a card whose
 * text runs on), or whose tag contains `attr` (an icon button named by aria-label).
 */
export function controlState(
  html: string,
  find: { text: string } | { textStartsWith: string } | { attr: string },
): ControlState {
  const label = (inner: string) => textOf(withoutScreenReaderText(inner));
  const matches = (tag: string, inner: string) =>
    'text' in find ? label(inner) === find.text
      : 'textStartsWith' in find ? label(inner).startsWith(find.textStartsWith)
        : tag.includes(find.attr);
  const match = [...html.matchAll(/(<span[^>]*data-locked=""[^>]*>)?(<button[^>]*>)((?:(?!<\/button>).)*)<\/button>/g)]
    .find(([, , tag, inner]) => matches(tag, inner));
  if (!match) return 'missing';
  const [, hint, tag] = match;
  // A locked menu item stays focusable: aria-disabled instead of disabled (ActionMenuItem)
  if (hint || tag.includes('aria-disabled="true"')) return 'locked';
  return tag.includes('disabled=""') ? 'disabled' : 'open';
}
