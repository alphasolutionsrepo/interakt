// app/setup/_lib/demo-setup-api.ts

/**
 * Requests behind Demo Setup: the demo's status (and whether Ollama answers at a URL),
 * setting it up with a progress stream, and tearing it down. A refusal throws an
 * ApiError with the server's reason.
 */

import { handleApiResponse, toApiError } from '@/shared/api/api-error';
import type { ProviderReadinessView } from '@/shared/seeders/demo/demo-provider-view';

const ENDPOINT = '/api/admin/setup-demo';

/** One provider in the status, as the setup-demo route describes it */
export type ProviderView = ProviderReadinessView;

export interface DemoStatus {
  seeded: boolean;
  seededAt: string | null;
  seededProvider: string | null;
  providers: { recommended: string; options: ProviderView[] };
  manifest: {
    name: string;
    indexName: string;
    documents: number;
    fields: number;
    searchExperienceSlug: string;
    chatExperienceSlug: string;
    warmupEnabled: boolean;
  };
}

export interface SeedResult {
  action: string;
  skipped?: boolean;
  reason?: string;
  provider?: string;
  index?: { name: string; documents: number; embeddings: number };
  searchExperience?: { slug: string; accessToken: string };
  chatExperience?: { slug: string; accessToken: string };
  warmup?: { searchesRun: number; chatTurnsRun: number; analyticsChatTurnsRun: number };
  deleted?: string[];
}

/** The demo's status; with a URL, also whether Ollama answers there */
export async function loadDemoStatus(ollamaBaseUrl?: string): Promise<DemoStatus> {
  const url = ollamaBaseUrl ? `${ENDPOINT}?ollamaBaseUrl=${encodeURIComponent(ollamaBaseUrl)}` : ENDPOINT;
  return handleApiResponse<DemoStatus>(await fetch(url));
}

/** Start setting the demo up: the progress stream to read */
export async function startDemoSeed(body: Record<string, unknown>): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toApiError(res, 'Setup failed');
  if (!res.body) throw new Error('No response body');
  return res.body;
}

/** Tear the demo down */
export async function resetDemo(): Promise<SeedResult> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reset' }),
  });
  return handleApiResponse<SeedResult>(res, 'Reset failed');
}
