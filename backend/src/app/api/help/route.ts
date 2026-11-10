// src/app/api/help/route.ts
//
// Lists the end-user docs for client components (the docs search dialog's
// suggestions and its title-only fallback).
// GET /api/help  ->  DocsTree ({ root, groups })

import { NextResponse } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { listDocs } from '@/shared/help/help.server';

export const runtime = 'nodejs';

export const GET = withPermission('signed-in', async function GET() {
  return NextResponse.json(await listDocs());
});
