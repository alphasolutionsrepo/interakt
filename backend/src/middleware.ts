import { auth } from '@/features/auth/auth.api.handlers';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  // Define protected routes - all pages except landing page (/) and auth pages
  const protectedRoutes = [
    '/dashboard',
    '/search-indexes',
    '/search-experiences',
    '/ai-experiences',
    '/experiences',
    '/analytics',
    '/settings',
    '/playground',
    '/users',
    '/admin',
    '/health',
  ];
  
  const authRoutes = ['/login', '/register'];

  const isProtectedRoute = protectedRoutes.some(route => 
    nextUrl.pathname.startsWith(route)
  );
  const isAuthRoute = authRoutes.includes(nextUrl.pathname);

  // Redirect logged-in users away from auth pages and landing page to dashboard
  if (isLoggedIn && (isAuthRoute || nextUrl.pathname === '/')) {
    return NextResponse.redirect(new URL('/dashboard', nextUrl));
  }
  
  // Redirect non-logged-in users to login for protected routes
  if (!isLoggedIn && isProtectedRoute) {
    const callbackUrl = nextUrl.pathname + nextUrl.search;
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`, nextUrl)
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};