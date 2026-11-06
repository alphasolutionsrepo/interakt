// src/shared/help/load-help-doc.ts
//
// One help article for the help drawer, from GET /api/help/<slug>, and what the drawer
// says when it can't be loaded.

import { ApiError, errorText, handleApiResponse } from '@/shared/api/api-error';

export interface HelpDoc {
  title: string;
  content: string;
}

export async function loadHelpDoc(slug: string): Promise<HelpDoc> {
  return handleApiResponse<HelpDoc>(await fetch(`/api/help/${slug}`), 'Failed to load the article');
}

/** A missing article is expected while the docs grow; anything else says what failed */
export function helpDocError(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return "This article isn't available yet.";
  return errorText(error, 'Failed to load the article');
}
