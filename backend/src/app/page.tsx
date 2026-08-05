import { redirect } from 'next/navigation';
import { auth } from '@/features/auth/auth.api.handlers';

// The logged-out experience is just the login page — there's no separate
// marketing landing to maintain. Route by auth state. (Middleware also enforces
// this; this keeps the intent explicit and covers direct renders.)
export default async function Home() {
    const session = await auth();
    redirect(session?.user ? '/dashboard' : '/login');
}
