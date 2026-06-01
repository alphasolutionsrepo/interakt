// src/app/api/help/[...slug]/route.ts
//
// Serves end-user documentation markdown to the in-app HelpButton/HelpDrawer.
// GET /api/help/<slug...>  ->  { title, content }
//
// Read-only; reads from src/content/docs via the Node filesystem.

import { NextResponse } from 'next/server';

import { readHelpDoc } from '@/shared/help/help.server';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const docSlug = (slug ?? []).join('/');

  const doc = await readHelpDoc(docSlug);
  if (!doc) {
    return NextResponse.json({ error: 'Documentation not found' }, { status: 404 });
  }

  return NextResponse.json(doc);
}
