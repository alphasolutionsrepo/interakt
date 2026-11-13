// src/app/users/_components/RoleFormDialog.test.ts

/**
 * The permission list in the role form when a feature area is off: those permissions stay
 * listed, disabled, with one note per area, and saving keeps every one the role holds.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RolePermissionFields, unmetNote } from './RoleFormDialog';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

const render = (held: string[]) =>
  renderToStaticMarkup(createElement(RolePermissionFields, { permissions: new Set(held), onToggle: () => {} }));

/** [label text, checked, disabled] for the checkbox in the label containing `text` */
function box(html: string, text: string) {
  const label = [...html.matchAll(/<label[^>]*>(.*?)<\/label>/g)].map((m) => m[1]).find((l) => l.includes(text));
  if (!label) return undefined;
  const tag = /<button[^>]*role="checkbox"[^>]*>/.exec(label)![0];
  return { checked: tag.includes('aria-checked="true"'), disabled: / disabled=""/.test(tag) };
}

describe('RolePermissionFields', () => {
  it('disables the chat permissions with Chat off, keeping a held one ticked, and notes it with a link for an Admin', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('chat');
    const html = render(['tools:view']);
    expect(box(html, 'View tools and MCP connections')).toEqual({ checked: true, disabled: true });
    expect(box(html, 'Create, edit and delete tools and MCP connections')).toEqual({ checked: false, disabled: true });
    expect(html).toContain('Chat is turned off for this installation.');
    expect(html).toContain('Roles keep these permissions, and they apply again when Chat is on.');
    expect(html).toContain('href="/settings/features"');
  });

  it('words an unmet need that only a turned-off area blocks without a count of "more"', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('chat');
    const all = ['setup:run', 'ai-providers:manage', 'settings:manage', 'search-indexes:edit', 'documents:edit', 'search-experiences:edit', 'data-sources:edit', 'prompts:edit'];
    const html = render(all);
    expect(html).toContain('needs 2 permissions in Chat to take effect, turned off for this installation');
    expect(html).not.toContain('needs 0 more');
    // With some still to tick, the count stays
    expect(render(['setup:run'])).toContain('needs 7 more permissions to take effect, and 2 in Chat, turned off for this installation');
  });

  it('keeps prompts:* enabled with Chat off and Managed indexes on, and disables it with both off, naming both', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('chat');
    const VIEW = 'View prompt templates, knowledge base and domain knowledge';
    const EDIT = 'Edit prompt templates, knowledge base and domain knowledge';
    const chatOff = render(['prompts:view']);
    expect(box(chatOff, VIEW)).toEqual({ checked: true, disabled: false });
    expect(box(chatOff, EDIT)).toEqual({ checked: false, disabled: false });

    uiAccess.areasOff('chat', 'managed-indexes');
    const bothOff = render(['prompts:view']);
    expect(box(bothOff, VIEW)).toEqual({ checked: true, disabled: true });
    expect(box(bothOff, EDIT)).toEqual({ checked: false, disabled: true });
    expect(bothOff).toContain('Chat and Managed indexes are turned off for this installation.');
    expect(bothOff).toContain('apply again when Chat or Managed indexes is on.');
  });

  it('words the three shapes of unmet need', () => {
    const label = () => 'Chat';
    expect(unmetNote({ tickable: [1], blocked: [], blockedAreas: [] }, label)).toBe('needs 1 more permission to take effect');
    expect(unmetNote({ tickable: [], blocked: [1], blockedAreas: ['chat'] }, label)).toBe('needs 1 permission in Chat to take effect, turned off for this installation');
  });

  it('leaves permissions of areas that are on, and core ones, switchable', () => {
    uiAccess.asAdmin();
    uiAccess.areasOff('chat');
    const html = render([]);
    expect(box(html, 'Manage secrets and ingestion keys')?.disabled).toBe(false);
  });

  it('has no note and nothing disabled when every area is on', () => {
    uiAccess.asAdmin();
    const html = render([]);
    expect(html).not.toContain('turned off');
    expect(box(html, 'View tools and MCP connections')?.disabled).toBe(false);
  });
});
