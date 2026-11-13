// src/app/data-sources/_components/CreateToolsPanel.test.ts

/**
 * Create Tools follows Chat (the server refuses the scaffold route with Chat off): it stays in
 * view, locked with the reason, with the Chat note; the permission and built-in rules still apply.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateToolsPanel } from './CreateToolsPanel';

import { uiAccess, uiAccessLoading } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@/app/tools/_lib/api-client', () => ({ toolsApi: { scaffoldTools: vi.fn() } }));

const CHAT_OFF = 'Chat is turned off for this installation.';
const render = (isBuiltIn = false) =>
  renderToStaticMarkup(createElement(CreateToolsPanel, { dataSourceId: 'ds1', isBuiltIn, onCreated: () => {} }));
/** The Create Tools <button>: disabled, and the reason in the lock hint around it (if any) */
const button = (html: string) => {
  const at = html.indexOf('Create Tools');
  const tag = html.slice(html.lastIndexOf('<button', at), at);
  const hint = html.lastIndexOf('data-locked', at) > -1 ? html.slice(at, html.indexOf('</span>', html.indexOf('sr-only', at)) ) : '';
  return { disabled: /\sdisabled=""/.test(tag), hint };
};

describe('Create Tools on a data source', () => {
  beforeEach(() => uiAccess.asAdmin());

  it('is usable with Chat on, with no note', () => {
    const html = render();
    expect(button(html).disabled).toBe(false);
    expect(html).not.toContain(CHAT_OFF);
  });

  it('stays in view with Chat off, locked with the reason, and the note says Chat is off', () => {
    uiAccess.areasOff('chat');
    const html = render();
    const b = button(html);
    expect(b.disabled).toBe(true);
    expect(b.hint).toContain(CHAT_OFF);
    expect(html).toContain('role="note"');
    expect(html).toContain('Tools are part of Chat.');
  });

  it('still locks by permission for a role without tools:edit, with Chat on', () => {
    uiAccess.hold('data-sources:view', 'tools:view');
    const b = button(render());
    expect(b.disabled).toBe(true);
    expect(b.hint).not.toContain(CHAT_OFF);
  });

  it('shows no Chat note while access loads', () => {
    uiAccessLoading();
    const html = render();
    expect(html).not.toContain(CHAT_OFF);
    expect(button(html).disabled).toBe(true);
  });
});
