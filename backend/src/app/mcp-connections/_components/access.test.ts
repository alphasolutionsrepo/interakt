// src/app/mcp-connections/_components/access.test.ts

/**
 * MCP connections: New Connection, a row's Delete, and a connection's Test, Sync and
 * Active / Inactive locked with the reason for a user who can only view them; open to a tool
 * editor, with Test (which calls the server for real) needing playground:use.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import McpConnectionDetailPage from '../(pages)/[id]/page';
import McpConnectionsPage from '../(pages)/page';

import { controlState, menuItems } from '@/shared/test/rendered-controls';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@/components/ui/dropdown-menu', async () => (await import('@/shared/test/open-overlays-stub')).dropdownMenu);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

const connection = {
  id: 'c1', name: 'Store', slug: 'store', description: null, serverUrl: 'http://127.0.0.1:9', transport: 'http',
  status: 'healthy', isActive: true, authConfig: null, discoveredTools: { tools: [] },
  lastDiscoveredAt: null, lastHealthCheckAt: null, lastHealthMessage: null,
};
vi.mock('../_lib/hooks/useMcpConnections', () => ({
  useMcpConnections: () => ({
    connections: [connection], pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    isLoading: false, isRefetching: false, isDeleting: false, deleteConnection: async () => {}, refetch: () => {},
  }),
  useMcpConnection: () => ({
    connection, isLoading: false, isError: false,
    syncConnection: () => {}, isSyncing: false, testConnection: () => {}, isTesting: false,
    updateConnection: () => {}, isUpdating: false,
  }),
}));

const listPage = () => renderToStaticMarkup(createElement(McpConnectionsPage));
// An already-settled params promise, so React's use() reads it without suspending
const params = Object.assign(Promise.resolve({ id: 'c1' }), { status: 'fulfilled', value: { id: 'c1' } });
const detailPage = () => renderToStaticMarkup(createElement(McpConnectionDetailPage, { params }));
const DETAIL = ['Test', 'Sync', 'Active'] as const;
const detailStates = () => { const html = detailPage(); return Object.fromEntries(DETAIL.map((text) => [text, controlState(html, { text })])); };

describe('the MCP connections list', () => {
  it('locks New Connection and a row\'s Delete for a viewer, with the reason', () => {
    uiAccess.hold('tools:view');
    const html = listPage();
    expect(controlState(html, { text: 'New Connection' })).toBe('locked');
    expect(menuItems(html)).toContain('Delete (locked)');
    expect(html).toContain('You don&#x27;t have permission to delete MCP connections.');
  });

  it('opens them to a tool editor', () => {
    uiAccess.hold('tools:view', 'tools:edit');
    const html = listPage();
    expect(controlState(html, { text: 'New Connection' })).toBe('open');
    expect(menuItems(html)).toContain('Delete');
  });
});

describe("an MCP connection's page", () => {
  it('locks Test, Sync and Active / Inactive for a viewer', () => {
    uiAccess.hold('tools:view');
    expect(detailStates()).toEqual({ Test: 'locked', Sync: 'locked', Active: 'locked' });
  });

  it('opens Sync and Active / Inactive to a tool editor, and Test only with playground:use', () => {
    uiAccess.hold('tools:view', 'tools:edit');
    expect(detailStates()).toEqual({ Test: 'locked', Sync: 'open', Active: 'open' });
    uiAccess.hold('tools:view', 'tools:edit', 'playground:use');
    expect(detailStates()).toEqual({ Test: 'open', Sync: 'open', Active: 'open' });
  });
});
