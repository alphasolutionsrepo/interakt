// app/setup/_lib/demo-setup-api.ts

/**
 * Requests behind Demo Setup: the demo's status (and whether Ollama answers at a URL),
 * setting it up with a progress stream, and tearing it down. A refusal throws an
 * ApiError with the server's reason.
 */

import { handleApiResponse, type ApiErrorBody } from '@/shared/api/api-error';
import { postForEvents } from '@/shared/api/stream-events';
import type { ProviderReadinessView } from '@/shared/seeders/demo/demo-provider-view';
import type { SeedProgressEvent } from '@/shared/seeders/demo/demo-steps';

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

/** One event of a setup's progress stream, as the setup-demo route sends it */
export type DemoSeedEvent = { type?: string; data?: SeedResult } & Partial<SeedProgressEvent> & ApiErrorBody;

/** Start setting the demo up: its progress events */
export async function startDemoSeed(body: Record<string, unknown>): Promise<AsyncGenerator<DemoSeedEvent>> {
  return postForEvents<DemoSeedEvent>(ENDPOINT, body, 'Setup failed');
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
