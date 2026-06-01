// app/playground/widget/page.tsx

import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/features/auth/auth.api.handlers';
import { WidgetPlayground } from './_components/WidgetPlayground';

export const metadata: Metadata = {
  title: 'Drop-in Widget Playground',
  description: 'Pick any chat or search experience and render its drop-in widget exactly as customers will see it.',
};

export default async function WidgetPlaygroundPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/login?callbackUrl=/playground/widget');
  }
  return <WidgetPlayground />;
}
