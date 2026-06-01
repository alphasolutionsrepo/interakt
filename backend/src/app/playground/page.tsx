// app/playground/page.tsx

/**
 * Playground Landing Page
 * 
 * Overview of available playground services with quick access.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/features/auth/auth.api.handlers';

export default async function PlaygroundPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login?callbackUrl=/playground');
  }

  // Redirect to the primary playground (AI Service)
  redirect('/playground/ai-service');
}