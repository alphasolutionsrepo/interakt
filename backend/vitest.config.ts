import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    server: {
      // Force Vite to transform next-auth (and its env.js) so our aliases for
      // its `next/server` import actually take effect. Without inlining, the
      // package is loaded by Node directly and the alias is bypassed.
      deps: { inline: [/next-auth/] },
    },
  },
  resolve: {
    alias: {
      '@/features': path.resolve(__dirname, 'src/features'),
      '@/shared': path.resolve(__dirname, 'src/shared'),
      '@/config': path.resolve(__dirname, 'config'),
      '@/db': path.resolve(__dirname, 'db'),
      // server-only throws when imported outside an RSC context; in tests we
      // need to no-op it so modules that gate themselves with it can be loaded.
      'server-only': path.resolve(__dirname, 'src/shared/test/server-only-stub.ts'),
      // next-auth pulls in next/server which fails to resolve under vitest's
      // ESM resolver. Tests that touch this chain don't exercise auth, so
      // stub the entry points.
      'next/server': path.resolve(__dirname, 'src/shared/test/server-only-stub.ts'),
    },
  },
});
