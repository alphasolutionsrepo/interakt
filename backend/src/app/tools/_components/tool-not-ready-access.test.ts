// src/app/tools/_components/tool-not-ready-access.test.ts

/**
 * A tool that needs setup says why in the experience tool pickers, and links to its edit page
 * only for a role that can open it: a chat editor picks tools but may not be able to edit them.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ToolNotReadyNote } from './ToolNotReadyNote';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

const note = () => renderToStaticMarkup(createElement(ToolNotReadyNote, { toolId: 't1', reason: 'Its data source is inactive' }));

describe("a tool picker's note on a tool that needs setup", () => {
  it('gives the reason without a link for a chat editor who cannot edit tools', () => {
    uiAccess.hold('ai-experiences:view', 'ai-experiences:edit');
    const html = note();
    expect(html).toContain('Its data source is inactive');
    expect(html).not.toContain('href="/tools/t1/edit"');
  });

  it('links to the tool to set it up for a role that can edit tools', () => {
    uiAccess.hold('ai-experiences:view', 'ai-experiences:edit', 'tools:view', 'tools:edit');
    expect(note()).toContain('href="/tools/t1/edit"');
  });
});
