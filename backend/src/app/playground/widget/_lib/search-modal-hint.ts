/**
 * The hint above the playground preview when the search widget runs as a modal: it opens
 * from its round search button (bottom right) or the keyboard. The shortcut label comes
 * from the widget itself (SearchDropinUI.shortcutLabel: ⌘K on Apple devices, Ctrl+K
 * elsewhere), once the widget script has loaded in the preview.
 */
export const SEARCH_MODAL_HINT_SCRIPT =
  "window.addEventListener('load', function () { var w = window.SearchDropinUI; var label = w && w.shortcutLabel && w.shortcutLabel(); if (label) document.querySelectorAll('[data-shortcut]').forEach(function (el) { el.textContent = label; }); });";

export function searchModalHintHtml(): string {
  return `<div class="search-hint">Click the search button (bottom right), or press <kbd data-shortcut>Ctrl+K</kbd></div>
<script>${SEARCH_MODAL_HINT_SCRIPT}</script>`;
}
