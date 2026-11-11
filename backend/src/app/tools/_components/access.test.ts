// src/app/tools/_components/access.test.ts

/**
 * Tools and MCP connections: changes locked with the reason for a user who can only view them;
 * test runs (which call the tool or server for real) locked without playground:use.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToolTestPanel } from './ToolTestPanel';

import { uiAccess } from '@/shared/test/ui-access-stub';
import { controlState, menuItems } from '@/shared/test/rendered-controls';
import { DangerZone } from '@/shared/ui/custom/DangerZone';
import { RowActionsMenu } from '@/shared/ui/custom/RowActionsMenu';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@/components/ui/dropdown-menu', async () => (await import('@/shared/test/open-overlays-stub')).dropdownMenu);

const noop = () => {};

describe('tool and MCP menus', () => {
  beforeEach(() => uiAccess.hold('tools:view'));

  it('locks Edit and Delete on a tool for a viewer', () => {
    const html = renderToStaticMarkup(createElement(RowActionsMenu, {
      onView: noop, onEdit: noop, onDelete: noop, editAction: 'tools.edit', deleteAction: 'tools.delete', triggerClassName: '', itemClassName: '',
    }));
    expect(menuItems(html)).toEqual(['View Details', 'Edit (locked)', 'Delete (locked)']);
  });

  it('leaves Edit out where there is none (MCP connections) and locks Delete', () => {
    const html = renderToStaticMarkup(createElement(RowActionsMenu, {
      onView: noop, onDelete: noop, deleteAction: 'mcp.delete', triggerClassName: '', itemClassName: '',
    }));
    expect(menuItems(html)).toEqual(['View Details', 'Delete (locked)']);
    expect(html).toContain('You don&#x27;t have permission to delete MCP connections.');
  });
});

describe('the built-in help', () => {
  it('locks Edit and Delete on a built-in tool for a tool editor who is not an Admin', () => {
    uiAccess.hold('tools:view', 'tools:edit');
    const html = renderToStaticMarkup(createElement(RowActionsMenu, {
      onView: noop, onEdit: noop, onDelete: noop, editAction: 'tools.edit', deleteAction: 'tools.delete', builtIn: true, triggerClassName: '', itemClassName: '',
    }));
    expect(menuItems(html)).toEqual(['View Details', 'Edit (locked)', 'Delete (locked)']);
    expect(html).toContain('Only an Admin can change the built-in help.');
    const zone = renderToStaticMarkup(createElement(DangerZone, { thing: 'tool', detail: 'x', action: 'tools.delete', onDelete: noop, builtIn: true }));
    expect(controlState(zone, { text: 'Delete' })).toBe('locked');
  });
});

describe('tool test panel', () => {
  const panel = () => renderToStaticMarkup(createElement(ToolTestPanel, { toolId: 't', isActive: true, executorType: 'llm_inference', operation: null }));

  it('shows the panel with Run locked without playground:use, even for a tool editor', () => {
    uiAccess.hold('tools:view', 'tools:edit');
    expect(controlState(panel(), { text: 'Run' })).toBe('locked');
    expect(panel()).toContain('You don&#x27;t have permission to test tools.');
  });

  it('lets a playground user run it once there is input', () => {
    uiAccess.hold('tools:view', 'playground:use');
    expect(controlState(panel(), { text: 'Run' })).toBe('disabled'); // empty input: its own reason, no lock
  });
});

describe("a tool's Danger Zone", () => {
  const zone = (disabled: boolean) => renderToStaticMarkup(createElement(DangerZone, {
    thing: 'tool', detail: 'x', action: 'tools.delete', onDelete: noop, disabled,
  }));

  it('locks Delete for a viewer', () => {
    uiAccess.hold('tools:view');
    expect(controlState(zone(false), { text: 'Delete' })).toBe('locked');
  });

  it('keeps Delete disabled, without the lock, while experiences still use the tool', () => {
    uiAccess.hold('tools:edit');
    expect(controlState(zone(true), { text: 'Delete' })).toBe('disabled');
    expect(controlState(zone(false), { text: 'Delete' })).toBe('open');
  });
});
