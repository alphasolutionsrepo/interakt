/**
 * The hint above the playground preview when the search widget runs as a modal: it opens
 * from its round search button (bottom right) or the keyboard. The shortcut is named as the
 * viewer's keyboard shows it (⌘ K on Apple devices, Ctrl K elsewhere; both keys work
 * everywhere). The preview sets it itself, where `navigator` is the viewer's browser.
 */
export const SEARCH_MODAL_HINT_SCRIPT =
  "if (/mac|iphone|ipad/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '')) document.querySelectorAll('[data-shortcut]').forEach(function (el) { el.textContent = '⌘ K'; });";

export function searchModalHintHtml(): string {
  return `<div class="search-hint">Click the search button (bottom right), or press <kbd data-shortcut>Ctrl K</kbd></div>
<script>${SEARCH_MODAL_HINT_SCRIPT}</script>`;
}
