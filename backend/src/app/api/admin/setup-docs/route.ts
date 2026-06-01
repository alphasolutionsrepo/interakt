// src/app/api/admin/setup-docs/route.ts
//
// Builds the docs "Help Assistant" from inside the Next runtime (service layer,
// server-only modules, pipeline handlers all initialised at boot). Admin-only.
//
//   GET                      → status + embedding readiness (gates the build)
//   POST { action: 'seed' }  → ingest docs + create tool + experience
//                              (body: { force?, stream? })
//   POST { action: 'reset' } → tear it down

import { NextRequest, NextResponse } from 'next/server';

import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { seedDocs, resetDocs, getDocsSeedStatus } from '@/shared/seeders/docs';
import type { DocsSeedProgressEvent } from '@/shared/seeders/docs/docs-steps';
import { getCurrentUser } from '@/shared/utils/auth-utils';

const logger = createLogger('setup-docs-api');

// Embedding ~20 docs can take a little while.
export const maxDuration = 300;

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, res: apiResponse.unauthorized('You must be logged in') };
  if ((user as { role?: string }).role !== 'admin') {
    return { ok: false as const, res: apiResponse.forbidden('Admin role required') };
  }
  return { ok: true as const, user };
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  try {
    const status = await getDocsSeedStatus();
    return apiResponse.success(status);
  } catch (e) {
    logger.error('setup-docs status failed', e as Error);
    return apiResponse.error(e as Error);
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  let body: { action?: string; force?: boolean; stream?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // empty body → default to seed
  }
  const action = body.action ?? 'seed';

  try {
    if (action === 'reset') {
      const result = await resetDocs();
      logger.info('Docs reset via API', { deleted: result.deleted.length });
      return apiResponse.success({ action: 'reset', ...result });
    }

    if (action === 'seed') {
      const force = body.force ?? false;
      if (body.stream) return streamSeed(force);

      const summary = await seedDocs({ force });
      logger.info('Docs seeded via API', { skipped: summary.skipped, docs: summary.documents });
      return apiResponse.success({ action: 'seed', ...summary });
    }

    return apiResponse.badRequest(`Unknown action "${action}". Use "seed" or "reset".`);
  } catch (e) {
    logger.error('setup-docs failed', e as Error);
    return apiResponse.error(e as Error);
  }
}

/** Run the seed while streaming step progress as SSE (matches the demo route's convention). */
function streamSeed(force: boolean): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (msg: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
      const onProgress = (event: DocsSeedProgressEvent) => emit({ type: 'progress', ...event });

      try {
        const summary = await seedDocs({ force, onProgress });
        emit({ type: 'complete', data: { action: 'seed', ...summary } });
      } catch (e) {
        logger.error('setup-docs stream failed', e as Error);
        emit({ type: 'error', error: (e as Error).message });
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
