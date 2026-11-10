// src/app/ai-providers/_components/access.test.ts

/**
 * The AI providers page offers each change only to a user who may make it: someone who can
 * only view providers sees the list, the models and the defaults, read-only.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ManageModelsDialog } from './ManageModelsDialog';
import { ProviderTable } from './ProviderTable';
import { SystemDefaultsCard } from './SystemDefaultsCard';

import type { AIProviderWithModelsResponse } from '@/features/ai-providers';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@/components/ui/dropdown-menu', async () => (await import('@/shared/test/open-overlays-stub')).dropdownMenu);
vi.mock('@/components/ui/dialog', async () => (await import('@/shared/test/open-overlays-stub')).dialog);

const model = { id: 1, displayName: 'Qwen', modelKey: 'qwen', modelType: 'chat', isAvailable: true, isDiscovered: false };
const ollama = {
  id: 'p1', displayName: 'Local Ollama', providerKey: 'ollama', providerType: 'local', authType: 'none',
  hasApiKey: false, isEnabled: true, models: [model], lastConnectionStatus: 'success', lastConnectionCheck: null,
} as unknown as AIProviderWithModelsResponse;
const empty = { ...ollama, id: 'p2', models: [] } as AIProviderWithModelsResponse;

const noop = () => {};
const table = () => renderToStaticMarkup(createElement(ProviderTable, {
  providers: [ollama], onEdit: noop, onDelete: noop, onManageModels: noop, onTestConnection: noop, onDiscoverModels: noop, onToggleEnabled: noop,
}));
const models = (provider = ollama) => renderToStaticMarkup(createElement(ManageModelsDialog, {
  open: true, onOpenChange: noop, provider, onModelsChanged: noop, onDiscoverModels: noop,
}));
const defaults = () => renderToStaticMarkup(createElement(SystemDefaultsCard, {
  defaults: undefined, providers: [ollama], onSave: async () => {},
}));

const menuItems = (html: string) => [...html.matchAll(/role="menuitem"[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
const switchDisabled = (html: string, label: string) =>
  new RegExp(`<button[^>]*role="switch"[^>]*aria-label="${label}"[^>]*>`).exec(html)?.[0].includes('disabled=""');

describe('provider list', () => {
  beforeEach(() => uiAccess.hold('ai-providers:view'));

  it('offers a viewer only to look at the models, with the enabled switch read-only', () => {
    const html = table();
    expect(menuItems(html)).toEqual(['View Models']);
    expect(html).not.toContain('<hr');
    expect(switchDisabled(html, 'Local Ollama enabled')).toBe(true);
  });

  it('offers a provider manager every action', () => {
    uiAccess.hold('ai-providers:manage', 'ai-providers:view');
    const html = table();
    expect(menuItems(html)).toEqual(['Edit Provider', 'Manage Models', 'Test Connection', 'Discover Models', 'Delete']);
    expect(switchDisabled(html, 'Local Ollama enabled')).toBe(false);
  });
});

describe('models dialog', () => {
  beforeEach(() => uiAccess.hold('ai-providers:view'));

  it('lists the models read-only for a viewer', () => {
    const html = models();
    expect(html).toContain('Models for Local Ollama');
    expect(html).toContain('Qwen');
    expect(html).not.toContain('Add Model');
    expect(html).not.toContain('Discover Models');
    expect(menuItems(html)).toEqual([]);
    expect(switchDisabled(html, 'Qwen available')).toBe(true);
  });

  it('shows a viewer an empty provider without the add or discover prompts', () => {
    const html = models(empty);
    expect(html).toContain('No models configured');
    expect(html).not.toContain('Add models to start');
    expect(html).not.toContain('Add Model');
  });

  it('lets a provider manager add, discover, edit and delete', () => {
    uiAccess.hold('ai-providers:manage', 'ai-providers:view');
    const html = models();
    expect(html).toContain('Add, edit, or remove models for Local Ollama');
    expect(html).toContain('Add Model');
    expect(html).toContain('Discover Models');
    expect(menuItems(html)).toEqual(['Edit', 'Delete']);
    expect(switchDisabled(html, 'Qwen available')).toBe(false);
  });

  it('offers the empty-state add and discover buttons once each to a manager', () => {
    uiAccess.hold('ai-providers:manage', 'ai-providers:view');
    const html = models(empty);
    expect(html.match(/Add Model/g)).toHaveLength(2); // action bar + empty state
    expect(html).toContain('Discover models from Ollama or add them manually');
  });
});

describe('system defaults', () => {
  const triggersDisabled = (html: string) =>
    [...html.matchAll(/<button[^>]*role="combobox"[^>]*>/g)].map(([tag]) => tag.includes('disabled=""'));

  it('are read-only without settings:manage, even for a provider manager', () => {
    uiAccess.hold('ai-providers:manage', 'ai-providers:view', 'settings:view');
    expect(triggersDisabled(defaults()).every(Boolean)).toBe(true);
  });

  it('can be changed with settings:manage', () => {
    uiAccess.hold('settings:manage', 'settings:view', 'ai-providers:view');
    // The provider select of each purpose is open to change (the model select waits for a provider)
    expect(triggersDisabled(defaults()).filter((d) => !d)).toHaveLength(3);
  });
});
