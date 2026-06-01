import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';
import { mkdirSync, copyFileSync } from 'node:fs';

/**
 * After every build (including each rebuild in `--watch` mode), copy the
 * freshly emitted bundle into the backend's public folder so Next.js serves
 * the latest widgets.js at `/embed/v1/widgets.js` without a manual cp.
 */
function copyToBackendPublic() {
  return {
    name: 'copy-to-backend-public',
    writeBundle() {
      const dest = resolve(__dirname, '..', 'public', 'embed', 'v1');
      mkdirSync(dest, { recursive: true });
      copyFileSync(
        resolve(__dirname, 'dist', 'widgets.js'),
        resolve(dest, 'widgets.js'),
      );
    },
  };
}

export default defineConfig({
  plugins: [preact(), copyToBackendPublic()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  // Prevent Vite from walking up and loading the parent backend's Tailwind PostCSS config.
  // Widget CSS is imported via `?raw` and needs no PostCSS processing.
  css: {
    postcss: { plugins: [] },
  },
  build: {
    target: 'es2019',
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'InteraktWidgets',
      formats: ['iife'],
      fileName: () => 'widgets.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        extend: true,
      },
    },
  },
});
