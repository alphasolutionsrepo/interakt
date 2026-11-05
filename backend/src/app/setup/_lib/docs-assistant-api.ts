// app/setup/_lib/docs-assistant-api.ts

/**
 * Requests behind the Documentation Assistant card: its status, and building it with
 * a progress stream. A refusal throws an ApiError with the server's reason.
 */

import { handleApiResponse } from '@/shared/api/api-error';
import { postForEvents } from '@/shared/api/stream-events';
import type { DocsSeedStatus } from '@/shared/seeders/docs/docs.seeder';

const ENDPOINT = '/api/admin/setup-docs';

/** The assistant's status, as the setup-docs route answers it */
export type DocsStatus = DocsSeedStatus;

export async function loadDocsStatus(): Promise<DocsStatus> {
  return handleApiResponse<DocsStatus>(await fetch(ENDPOINT), 'Failed to load the assistant status');
}

/** Build (or with force, rebuild) the assistant: the progress stream to read */
export async function startDocsBuild(force: boolean): Promise<ReadableStream<Uint8Array>> {
  return postForEvents(ENDPOINT, { action: 'seed', force, stream: true }, 'Build failed');
}
