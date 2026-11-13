// src/app/mcp-connections/_components/area-off.test.ts

/** An MCP connection's Test button with Playground off: still there, locked with the reason. */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import McpConnectionDetailPage from '../(pages)/[id]/page';

import { controlState } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

const connection = {
  id: 'c1', name: 'Store', slug: 'store', description: null, serverUrl: 'http://127.0.0.1:9', transport: 'http',
  status: 'healthy', isActive: true, authConfig: null, discoveredTools: { tools: [] },
  lastDiscoveredAt: null, lastHealthCheckAt: null, lastHealthMessage: null,
};
vi.mock('../_lib/hooks/useMcpConnections', () => ({
  useMcpConnection: () => ({
    connection, isLoading: false, isError: false,
    syncConnection: () => {}, isSyncing: false, testConnection: () => {}, isTesting: false,
    updateConnection: () => {}, isUpdating: false,
  }),
}));

const params = Object.assign(Promise.resolve({ id: 'c1' }), { status: 'fulfilled', value: { id: 'c1' } });
const page = () => renderToStaticMarkup(createElement(McpConnectionDetailPage, { params }));

describe('an MCP connection page with Playground off', () => {
  it('keeps Test visible but locked with the reason, and Sync open', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('playground');
    const html = page();
    expect(controlState(html, { text: 'Test' })).toBe('locked');
    expect(controlState(html, { text: 'Sync' })).toBe('open');
    expect(html).toContain('Playground is turned off for this installation.');
  });

  it('leaves Test usable, with no Playground note, while Playground is on', () => {
    uiAccess.asAdmin();
    const html = page();
    expect(controlState(html, { text: 'Test' })).toBe('open');
    expect(controlState(html, { text: 'Sync' })).toBe('open');
    expect(html).not.toContain('Playground is turned off');
  });
});
