/**
 * CI guard rail: prevents silent bundle bloat.
 *
 * Requires a prior `npm run build`. Skips with a console warning if dist/
 * is missing, so the test doesn't fail fresh clones — CI enforces via the
 * build-before-test order in the pipeline.
 */
import { describe, it, expect } from 'vitest';
import { statSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';

const BUNDLE = resolve(__dirname, '../dist/widgets.js');
const MAX_GZIP_BYTES = 100 * 1024; // 100 KB

describe('bundle size budget', () => {
  it('stays under 100 KB gzipped', () => {
    if (!existsSync(BUNDLE)) {
      console.warn(
        `[size-budget] ${BUNDLE} not found; run \`npm run build\` first. Skipping.`,
      );
      return;
    }

    const raw = readFileSync(BUNDLE);
    const gzipped = gzipSync(raw).length;
    const rawBytes = statSync(BUNDLE).size;

    console.info(
      `[size-budget] raw=${rawBytes}B, gzip=${gzipped}B (${(
        (gzipped / MAX_GZIP_BYTES) *
        100
      ).toFixed(1)}% of 100 KB budget)`,
    );

    expect(gzipped).toBeLessThan(MAX_GZIP_BYTES);
  });
});
