// app/api/health/live/route.ts
//
// Public liveness probe — for Azure App Service, k8s, load balancers, and any
// other external monitor that just needs to know "is the process up?". Returns
// 200 unconditionally; deliberately does NOT touch the DB, Elasticsearch, or
// AI providers. The auth-gated /api/health endpoint is what the admin UI uses
// to inspect those.

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
