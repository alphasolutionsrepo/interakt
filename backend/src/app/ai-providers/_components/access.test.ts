// src/app/ai-providers/_components/access.test.ts

/**
 * The AI providers page: someone who can only view providers sees every control, locked with
 * the reason; a provider manager can use them. Values (switches, defaults) show either way.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ManageModelsDialog } from './ManageModelsDialog';
import { ProviderTable } from './ProviderTable';
import { SystemDefaultsCard } from './SystemDefaultsCard';

import type { AIProviderWithModelsResponse } from '@/features/ai-providers';
import { controlState, menuItems } from '@/shared/test/rendered-controls';
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

const switchDisabled = (html: string, label: string) =>
  new RegExp(`<button[^>]*role="switch"[^>]*aria-label="${label}"[^>]*>`).exec(html)?.[0].includes('disabled=""');

describe('provider list', () => {
  beforeEach(() => uiAccess.hold('ai-providers:view'));

  it('shows a viewer every action locked, with the models open to look at and the switch read-only', () => {
    const html = table();
    expect(menuItems(html)).toEqual([
      'Edit Provider (locked)', 'View Models', 'Test Connection (locked)', 'Discover Models (locked)', 'Delete (locked)',
    ]);
    expect(html).toContain('You don&#x27;t have permission to delete AI providers.');
    expect(switchDisabled(html, 'Local Ollama enabled')).toBe(true);
  });

  it('lets a provider manager use every action', () => {
    uiAccess.hold('ai-providers:manage', 'ai-providers:view');
    const html = table();
    expect(menuItems(html)).toEqual(['Edit Provider', 'Manage Models', 'Test Connection', 'Discover Models', 'Delete']);
    expect(switchDisabled(html, 'Local Ollama enabled')).toBe(false);
  });
});

describe('models dialog', () => {
  beforeEach(() => uiAccess.hold('ai-providers:view'));

  it('lists the models for a viewer with every change locked', () => {
    const html = models();
    expect(html).toContain('Models for Local Ollama');
    expect(html).toContain('Qwen');
    expect(controlState(html, { text: 'Add Model' }) === 'locked').toBe(true);
    expect(controlState(html, { text: 'Discover Models' }) === 'locked').toBe(true);
    expect(menuItems(html)).toEqual(['Edit (locked)', 'Delete (locked)']);
    expect(switchDisabled(html, 'Qwen available')).toBe(true);
  });

  it('lets a provider manager add, discover, edit and delete', () => {
    uiAccess.hold('ai-providers:manage', 'ai-providers:view');
    const html = models();
    expect(html).toContain('Add, edit, or remove models for Local Ollama');
    expect(controlState(html, { text: 'Add Model' }) === 'locked').toBe(false);
    expect(html).toContain('Add Model');
    expect(menuItems(html)).toEqual(['Edit', 'Delete']);
    expect(switchDisabled(html, 'Qwen available')).toBe(false);
  });

  it('offers the add and discover buttons in the empty state too, locked for a viewer', () => {
    const html = models(empty);
    expect(html).toContain('No models configured');
    expect(html.match(/Add Model/g)).toHaveLength(2); // action bar + empty state
    expect(controlState(html, { text: 'Add Model' }) === 'locked').toBe(true);
  });
});

describe('system defaults', () => {
  const triggersDisabled = (html: string) =>
    [...html.matchAll(/<button[^>]*role="combobox"[^>]*>/g)].map(([tag]) => tag.includes('disabled=""'));

  it('are locked without settings:manage, even for a provider manager, and say why', () => {
    uiAccess.hold('ai-providers:manage', 'ai-providers:view', 'settings:view');
    const html = defaults();
    expect(triggersDisabled(html).every(Boolean)).toBe(true);
    expect(html).toContain('You don&#x27;t have permission to change the system default models.');
  });

  it('can be changed with settings:manage', () => {
    uiAccess.hold('settings:manage', 'settings:view', 'ai-providers:view');
    // The provider select of each purpose is open to change (the model select waits for a provider)
    expect(triggersDisabled(defaults()).filter((d) => !d)).toHaveLength(3);
  });
});
