// Stand-in for `next/server` in unit tests, aliased in vitest.config.ts.
// The real module doesn't resolve under vitest's ESM resolver (next-auth pulls it in).
// These follow the parts of the API our routes use, on top of the standard
// Request and Response, so route handlers can be called directly in tests.

export class NextResponse<Body = unknown> extends Response {
  declare readonly __body?: Body;

  static json<T>(body: T, init?: ResponseInit): NextResponse<T> {
    const headers = new Headers(init?.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    return new NextResponse<T>(JSON.stringify(body), { ...init, headers });
  }
}

export class NextRequest extends Request {
  readonly nextUrl: URL;

  constructor(input: string | URL, init?: RequestInit) {
    super(input, init);
    this.nextUrl = new URL(typeof input === 'string' ? input : input.href);
  }
}
