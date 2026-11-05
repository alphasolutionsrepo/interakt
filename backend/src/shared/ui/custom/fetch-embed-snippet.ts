// shared/ui/custom/fetch-embed-snippet.ts

/**
 * The embed snippet the API serves for an experience (GET /api/v1/embed-snippet), as
 * the admin's chat and search widget cards show it. Called with the experience's
 * access token, not the admin session.
 */

import type { Widget } from '@/features/embed/build-snippet';

import { handleApiResponse } from '@/shared/api/api-error';

export interface EmbedSnippet {
  widget: Widget;
  experienceName: string;
  scriptUrl: string;
  containerId: string;
  globalName: string;
  html: string;
}

export async function fetchEmbedSnippet(accessToken: string, containerId: string | undefined, signal?: AbortSignal): Promise<EmbedSnippet> {
  const query = containerId ? `?${new URLSearchParams({ containerId })}` : '';
  const response = await fetch(`/api/v1/embed-snippet${query}`, {
    method: 'GET',
    headers: { 'X-Access-Token': accessToken },
    signal,
    credentials: 'omit',
  });
  return handleApiResponse<EmbedSnippet>(response, 'Failed to load the embed snippet');
}
