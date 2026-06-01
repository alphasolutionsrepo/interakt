// app/playground/ai-service/page.tsx

import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/features/auth/auth.api.handlers';
import { AIPlayground } from './_components/AIPlayground';

export const metadata: Metadata = {
    title: 'AI Provider Playground',
    description: 'Test AI text generation, chat, and embeddings',
};

export default async function AIServicePlaygroundPage() {
    const session = await auth();

    if (!session?.user) {
        redirect('/login?callbackUrl=/playground/ai-service');
    }

    return <AIPlayground />;
}
