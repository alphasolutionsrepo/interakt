// src/app/docs/[[...slug]]/page.tsx
//
// Renders an end-user documentation page. /docs falls back to the landing
// index.md; /docs/<a>/<b> reads <a>/<b>.md from src/content/docs. The body
// is rendered by <DocBody>, the same component the help drawer uses, so
// the two surfaces stay visually and behaviorally in sync.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DocBody } from '@/shared/help/DocBody';
import { readHelpDoc } from '@/shared/help/help.server';

interface DocsPageProps {
  params: Promise<{ slug?: string[] }>;
}

function slugFromParams(slug: string[] | undefined): string {
  if (!slug || slug.length === 0) return 'index';
  return slug.join('/');
}

export async function generateMetadata({ params }: DocsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = await readHelpDoc(slugFromParams(slug));
  return { title: doc ? `${doc.title} · Docs` : 'Docs' };
}

export default async function DocsPage({ params }: DocsPageProps) {
  const { slug } = await params;
  const docSlug = slugFromParams(slug);
  const doc = await readHelpDoc(docSlug);
  if (!doc) notFound();

  return (
    <article className="prose-sm">
      <DocBody slug={docSlug} content={doc.content} />
    </article>
  );
}
