import { auth } from '@/features/auth/auth.api.handlers';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { nextUrl } = req;
  const { pathname } = nextUrl;
  const isLoggedIn = !!req.auth;

  // --- API routes ----------------------------------------------------------
  // Public API surface: NextAuth's own endpoints, the external widget / demo
  // endpoints under /v1 (they self-authenticate via experience access token),
  // and the unconditional liveness probe used by k8s/Azure. Every other /api
  // route requires a session and gets 401 JSON — never an HTML redirect.
  if (pathname.startsWith('/api')) {
    // Document routes on a search index accept either a session (admin UI) or an
    // ingestion key (server-to-server sync). Key validation needs a database
    // lookup, which this middleware cannot do at the edge — so a request
    // presenting a bearer credential is passed through for the route to
    // authenticate. Every one of those handlers calls resolveDocumentActor, so
    // an invalid key is still rejected there; nothing is trusted on the strength
    // of the header alone.
    //
    // Scoped to this subtree on purpose. Exempting any /api path that merely
    // carries an Authorization header would expose the handlers that have no
    // check of their own and rely on this middleware as their only gate.
    const hasBearerCredential =
      req.headers.get('authorization')?.startsWith('Bearer ') ?? false;
    const isSelfAuthenticatingDocumentRoute =
      /^\/api\/search-indexes\/[^/]+\/documents(\/.*)?$/.test(pathname);

    const isPublicApi =
      pathname.startsWith('/api/auth') ||
      pathname.startsWith('/api/v1') ||
      pathname === '/api/health/live' ||
      (isSelfAuthenticatingDocumentRoute && hasBearerCredential);

    if (!isPublicApi && !isLoggedIn) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // --- Pages ---------------------------------------------------------------
  // Deny-by-default: every page requires authentication EXCEPT the routes
  // listed here. New routes are protected automatically — nothing to maintain.
  const publicRoutes = ['/login', '/register'];

  // Static assets in /public (e.g. /logo/foo.png, /manifest.json) are served at
  // root paths and must stay reachable so public pages can render their images.
  const isStaticAsset = /\.[^/]+$/.test(pathname);
  const isPublicRoute = publicRoutes.includes(pathname);

  // Logged-in users have no reason to see the auth pages or the bare landing
  // route — send them straight to the dashboard.
  if (isLoggedIn && (isPublicRoute || pathname === '/')) {
    return NextResponse.redirect(new URL('/dashboard', nextUrl));
  }

  // Anyone not logged in hitting a non-public, non-asset route → login.
  if (!isLoggedIn && !isPublicRoute && !isStaticAsset) {
    const callbackUrl = pathname + nextUrl.search;
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`, nextUrl)
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
