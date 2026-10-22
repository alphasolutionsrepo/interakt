// src/app/api/help/route.ts
//
// Lists the end-user docs for client components (the docs search dialog's
// suggestions and its title-only fallback).
// GET /api/help  ->  DocsTree ({ root, groups })

import { NextResponse } from 'next/server';

import { listDocs } from '@/shared/help/help.server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(await listDocs());
}
