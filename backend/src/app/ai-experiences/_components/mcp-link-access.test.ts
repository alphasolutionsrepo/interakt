// src/app/ai-experiences/_components/mcp-link-access.test.ts

/**
 * A chat experience's MCP panel links to MCP connections (open one, create one) only for a role
 * that can open those pages; anyone else still sees the attached connection's name.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { McpAttachmentPanel } from './McpAttachmentPanel';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@/components/ui/dialog', async () => (await import('@/shared/test/open-overlays-stub')).dialog);
// Open what starts closed (the connection picker), as a click would
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: <T,>(initial: T) => actual.useState(initial === (false as T) ? (true as T) : initial) };
});

let attachments: unknown[] = [];
vi.mock('@/app/mcp-connections/_lib/hooks/useMcpConnections', () => ({
  useExperienceMcpAttachments: () => ({
    attachments, isLoading: false,
    attachConnection: async () => {}, isAttaching: false,
    updateAttachment: async () => {}, isUpdatingAttachment: false,
    detachConnection: async () => {}, isDetaching: false,
  }),
  useMcpConnections: () => ({ connections: [], isLoading: false }),
}));

const attached = {
  id: 'a1', aiExperienceId: 'x', mcpConnectionId: 'c1', enabledToolNames: null, isEnabled: true, sortOrder: 0,
  createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
  mcpConnection: { id: 'c1', name: 'Docs MCP', slug: 'docs-mcp', serverUrl: 'http://127.0.0.1:9', status: 'connected', isActive: true, discoveredTools: { tools: [] } },
};
const panel = () => renderToStaticMarkup(createElement(McpAttachmentPanel, { experienceId: 'x' }));
const count = (html: string, s: string) => html.split(s).length - 1;

describe("a chat experience's MCP panel", () => {
  beforeEach(() => { attachments = []; });

  it('offers Create one (empty panel and picker) to a role that can create MCP connections', () => {
    uiAccess.hold('ai-experiences:edit', 'tools:edit');
    expect(count(panel(), 'href="/mcp-connections/create"')).toBe(2);
  });

  it('leaves Create one out for a role that can’t', () => {
    uiAccess.hold('ai-experiences:edit', 'tools:view');
    const html = panel();
    expect(html).not.toContain('href="/mcp-connections/create"');
    expect(html).not.toContain('Create one');
  });

  it("links an attached connection's name for a role that can open MCP connections", () => {
    attachments = [attached];
    uiAccess.hold('ai-experiences:edit', 'tools:view');
    expect(panel()).toContain('href="/mcp-connections/c1"');
  });

  it("shows the name without the link to anyone else", () => {
    attachments = [attached];
    uiAccess.hold('ai-experiences:edit');
    const html = panel();
    expect(html).not.toContain('href="/mcp-connections');
    expect(html).toContain('Docs MCP');
  });
});
