// src/app/health/_components/access.test.ts

/**
 * System Health: the links to the playground (Test Queries, and the AI providers card's "Test
 * with real API calls") show only for a role that can open it.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import HealthPage from '../page';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('../_lib/hooks/useHealth', () => ({
  useSystemHealth: () => ({
    isLoading: false, isError: false, error: null, refetch: () => {},
    data: {
      status: 'healthy', timestamp: '2026-11-10T00:00:00Z', uptime: 1, version: 't',
      services: [{
        name: 'AI Providers', status: 'healthy', responseTime: 5, lastChecked: '2026-11-10T00:00:00Z',
        details: { providers: [{ name: 'Local', key: 'local', healthy: true, message: 'ok', responseTimeMs: 5 }] },
      }],
    },
  }),
}));

const page = () => renderToStaticMarkup(createElement(HealthPage));

describe('System Health', () => {
  it('leaves out the playground links for a role that can\'t open the playground', () => {
    uiAccess.hold('settings:view');
    const html = page();
    expect(html).not.toContain('href="/playground"');
    expect(html).not.toContain('Test Queries');
    expect(html).not.toContain('/playground/ai-service');
  });

  it('shows them to a playground user', () => {
    uiAccess.hold('settings:view', 'playground:use');
    const html = page();
    expect(html).toContain('Test Queries');
    expect(html).toContain('href="/playground/ai-service"');
  });
});

describe('System Health with Playground off', () => {
  it('leaves out the playground links', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('playground');
    const html = page();
    expect(html).not.toContain('Test Queries');
    expect(html).not.toContain('/playground/ai-service');
  });
});
