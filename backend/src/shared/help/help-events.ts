// src/shared/help/help-events.ts
//
// A window event that lets any component open the help drawer in a given mode
// (e.g. the /docs sidebar's search box opens it in Search mode). The listener
// lives in HelpButton, in the app header.

export type HelpMode = 'search' | 'ask';

export interface OpenHelpDetail {
  mode?: HelpMode;
}

export const OPEN_HELP_EVENT = 'interakt:open-help';

export function openHelp(detail: OpenHelpDetail = {}) {
  window.dispatchEvent(new CustomEvent<OpenHelpDetail>(OPEN_HELP_EVENT, { detail }));
}
