// src/app/jobs/_components/access.test.ts

/**
 * Background jobs and cache settings: someone who can view settings sees Run now, Schedule,
 * the per-job actions and Clear Cache locked with the reason; jobs:run and settings:manage
 * open them.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobRecord } from '../_lib/api-client';

import { JobsTable } from './JobsTable';
import { JobTypeCard } from './JobTypeCard';

import { CacheFeatureCard } from '@/app/settings/cache/_components/CacheFeatureCard';
import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@/components/ui/dropdown-menu', async () => (await import('@/shared/test/open-overlays-stub')).dropdownMenu);

const render = (el: ReactElement) => renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, el));

const jobType = { queue: 'reindex', label: 'Reindex', description: 'Rebuild an index', payloadExample: {} };
const failedJob: JobRecord = {
  id: 'j1', queue: 'reindex', state: 'failed', data: {}, output: null, retryCount: 1, retryLimit: 3,
  createdOn: '2026-11-01T00:00:00Z', startedOn: null, completedOn: null,
};
const card = () => render(createElement(JobTypeCard, { jobType }));
const table = () => render(createElement(JobsTable, { jobs: [failedJob], isLoading: false }));
const cache = () => render(createElement(CacheFeatureCard, {
  feature: { id: 'search-indexes', name: 'Search indexes', description: 'x', icon: 'database', color: 'blue' } as never,
  stats: { size: 3, maxSize: 10 } as never, onClear: () => {}, isClearing: false,
}));

describe('background jobs', () => {
  beforeEach(() => uiAccess.hold('settings:view'));

  it('locks Run now, Schedule and the per-job actions for a settings viewer', () => {
    expect(controlState(card(), { text: 'Run now' })).toBe('locked');
    expect(controlState(card(), { text: 'Schedule' })).toBe('locked');
    expect(controlState(table(), { text: 'Retry' })).toBe('locked');
    expect(controlState(table(), { text: 'View details' })).toBe('open');
    expect(card()).toContain('You don&#x27;t have permission to run background jobs.');
  });

  it('opens them with jobs:run', () => {
    uiAccess.hold('settings:view', 'jobs:run');
    expect(controlState(card(), { text: 'Run now' })).toBe('open');
    expect(controlState(table(), { text: 'Retry' })).toBe('open');
  });
});

describe('caches', () => {
  it('locks Clear Cache without settings:manage', () => {
    uiAccess.hold('settings:view');
    expect(controlState(cache(), { text: 'Clear Cache' })).toBe('locked');
    uiAccess.hold('settings:view', 'settings:manage');
    expect(controlState(cache(), { text: 'Clear Cache' })).toBe('open');
  });
});
