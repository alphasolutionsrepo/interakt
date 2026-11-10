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

/** Each menu item as "label", or "label (locked)" when locked. */
export function menuItems(html: string): string[] {
  return [...html.matchAll(/<button[^>]*role="menuitem"([^>]*)>(.*?)<\/button>/g)]
    .map(([, attrs, inner]) => `${textOf(inner)}${attrs.includes('disabled') && inner.includes('lucide-lock') ? ' (locked)' : ''}`);
}

/**
 * The state of the first button whose text is `text`, starts with `textStartsWith` (a card whose
 * text runs on), or whose tag contains `attr` (an icon button named by aria-label).
 */
export function controlState(
  html: string,
  find: { text: string } | { textStartsWith: string } | { attr: string },
): ControlState {
  const matches = (tag: string, inner: string) =>
    'text' in find ? textOf(inner) === find.text
      : 'textStartsWith' in find ? textOf(inner).startsWith(find.textStartsWith)
        : tag.includes(find.attr);
  const match = [...html.matchAll(/(<span[^>]*data-locked=""[^>]*>)?(<button[^>]*>)((?:(?!<\/button>).)*)<\/button>/g)]
    .find(([, , tag, inner]) => matches(tag, inner));
  if (!match) return 'missing';
  const [, hint, tag] = match;
  if (hint) return 'locked';
  return tag.includes('disabled=""') ? 'disabled' : 'open';
}
