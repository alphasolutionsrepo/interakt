// src/shared/seeders/docs/docs-source.test.ts

/**
 * A deployment without the docs folder is a setup step left to do, answered as that
 * (SETUP_REQUIRED), not a server failure.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/db/index', () => ({ db: {} }));

describe('reading the docs when their folder is missing', () => {
  it('is a setup step left to do, naming the folder', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/nonexistent-interakt-root');
    const { readDocs, DOCS_ROOT } = await import('./docs-source');

    await expect(readDocs()).rejects.toMatchObject({ code: 'SETUP_REQUIRED', status: 400, message: `No documentation found at ${DOCS_ROOT}.` });
  });
});
