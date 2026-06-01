// app/login/page.tsx

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/features/auth/auth.api.handlers';
import { LoginForm } from '@/app/login/_components/login-form';

export const metadata = {
    title: 'Sign In',
    description: 'Sign in to your account',
};

export default async function LoginPage() {
    const session = await auth();

    // Redirect if already logged in
    if (session?.user) {
        redirect('/dashboard');
    }

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-background">
            <Suspense fallback={
                <div className="flex items-center justify-center w-full h-full">
                    <div className="animate-pulse text-muted-foreground">Loading...</div>
                </div>
            }>
                <LoginForm />
            </Suspense>
        </div>
    );
}