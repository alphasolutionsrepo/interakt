// src/app/search-indexes/_components/LastJobBanner.test.ts

/** The index page says how the last job ended: failed (red), finished with problems (orange), or nothing */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LastJobBanner } from './LastJobBanner';

import type { IndexLastJob } from '@/db/schema/search-index.schema';

const render = (lastJob: IndexLastJob) => renderToStaticMarkup(createElement(LastJobBanner, { lastJob }));

const at = { startedAt: '2026-11-02T10:00:00.000Z', finishedAt: '2026-11-02T10:00:05.000Z' };

describe('LastJobBanner', () => {
    it('shows a partial upload in orange with what happened', () => {
        const html = render({ kind: 'upload', status: 'partial', ...at, summary: '1 of 2 documents indexed, 1 failed: No source field configured' });
        expect(html).toContain('Document upload finished with problems');
        expect(html).toContain('1 of 2 documents indexed, 1 failed: No source field configured');
        expect(html).toContain('amber');
    });

    it('shows a failed upload with its reason', () => {
        const html = render({ kind: 'upload', status: 'failed', ...at, error: { code: 'INDEXING_FAILED', message: 'None of the 2 documents were indexed' } });
        expect(html).toContain('Document upload failed');
        expect(html).toContain('None of the 2 documents were indexed');
    });

    it('shows nothing after a clean upload', () => {
        expect(render({ kind: 'upload', status: 'succeeded', ...at })).toBe('');
    });
});
