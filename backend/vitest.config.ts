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
      '@/app': path.resolve(__dirname, 'src/app'),
      '@/components/ui': path.resolve(__dirname, 'src/shared/ui/components'),
      '@/components/custom': path.resolve(__dirname, 'src/shared/ui/custom'),
      '@/lib/utils': path.resolve(__dirname, 'src/shared/utils/index.ts'),
      '@/hooks': path.resolve(__dirname, 'src/shared/hooks'),
      '@/features': path.resolve(__dirname, 'src/features'),
      '@/shared': path.resolve(__dirname, 'src/shared'),
      '@/config': path.resolve(__dirname, 'config'),
      '@/db': path.resolve(__dirname, 'db'),
      // server-only throws when imported outside an RSC context; in tests we
      // need to no-op it so modules that gate themselves with it can be loaded.
      'server-only': path.resolve(__dirname, 'src/shared/test/server-only-stub.ts'),
      // next-auth pulls in next/server which fails to resolve under vitest's
      // ESM resolver. The stand-in covers the NextRequest/NextResponse parts our
      // routes use, so route handlers can be tested directly.
      'next/server': path.resolve(__dirname, 'src/shared/test/next-server-stub.ts'),
    },
  },
});
