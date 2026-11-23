import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { afterEach, describe, expect, it, vi } from 'vitest';

import nextConfig from '../next.config';

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

async function cacheControlFor(source: string): Promise<string | undefined> {
  const rules = (await nextConfig.headers!()) as HeaderRule[];
  const rule = rules.find((r) => r.source === source);
  expect(rule, `no header rule for ${source}`).toBeDefined();
  return rule!.headers.find((h) => h.key === 'Cache-Control')?.value;
}

const STATIC_FILES = '/:path((?!_next/).*)\\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)';
const EMBED = '/embed/:path*';

describe('next.config cache headers for fixed-name public files', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([EMBED, STATIC_FILES])('%s: production browsers revalidate within minutes', async (source) => {
    vi.stubEnv('NODE_ENV', 'production');
    const value = await cacheControlFor(source);
    expect(value).toBe('public, max-age=300, stale-while-revalidate=86400');
    expect(value).not.toContain('immutable');
  });

  it.each([EMBED, STATIC_FILES])('%s: development always revalidates', async (source) => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(await cacheControlFor(source)).toBe('public, max-age=0, must-revalidate');
  });

  it('no rule tells production browsers to keep a file without checking back', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const values = rules.flatMap((r) => r.headers.filter((h) => h.key === 'Cache-Control').map((h) => h.value));
    for (const value of values) expect(value).not.toMatch(/immutable|max-age=31536000/);
  });

  it('the embed bundle still loads cross-origin', async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const embed = rules.find((r) => r.source === EMBED)!;
    expect(embed.headers).toContainEqual({ key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' });
  });

  it('covers fixed-name public files but leaves Next.js hashed build files alone', () => {
    const matches = getPathMatch(STATIC_FILES);
    for (const path of ['/embed/v1/widgets.js', '/logo.png', '/favicon.ico', '/logo/interakt_logo_highres.png']) {
      expect(matches(path), path).not.toBe(false);
    }
    for (const path of ['/_next/static/chunks/main-1a2b3c.js', '/_next/static/css/app-4d5e6f.css']) {
      expect(matches(path), path).toBe(false);
    }
  });
});
