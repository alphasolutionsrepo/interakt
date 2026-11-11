// src/app/ai-experiences/_components/link-access.test.ts

/**
 * Links from a chat experience to other areas show only to a role that can open them: the
 * prompt template a step uses, and Create one for MCP connections in the create wizard.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { CreateWizard } from './CreateWizard/CreateWizard';
import { PromptOverridePanel } from './PromptOverridePanel';

import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
// The wizard opens on its tools step (step 2), as after clicking Next
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: <T,>(initial: T) => actual.useState(initial === (1 as T) ? (2 as T) : initial) };
});
vi.mock('../_lib/hooks/useAIExperiences', () => ({
  useCreateAIExperience: () => ({ createExperience: async () => {}, isCreating: false }),
  useAIExperienceSlugAvailability: () => ({ isAvailable: true, isChecking: false, isDebouncing: false }),
}));
vi.mock('@/app/tools/_lib/hooks/useTools', () => ({ useAllActiveTools: () => ({ data: [] }) }));
vi.mock('@/app/mcp-connections/_lib/hooks/useMcpConnections', () => ({ useMcpConnections: () => ({ connections: [], isLoading: false }) }));
vi.mock('@/shared/ui/custom/ProviderModelSelect', () => ({ ProviderModelSelect: () => null }));

const template = { id: 't1', step: 'turn_planner', label: 'Planner', version: 1, status: 'active' };
vi.mock('@/app/prompt-templates/_lib/hooks/usePromptTemplates', () => ({
  usePromptTemplates: () => ({ templates: [template], isLoading: false }),
  useSystemDefaults: () => ({ defaults: { turn_planner: template }, isLoading: false }),
  useExperienceOverrides: () => ({
    overrides: [], isLoading: false,
    setOverride: async () => {}, isSettingOverride: false, removeOverride: async () => {}, isRemovingOverride: false,
  }),
}));

const prompts = () => renderToStaticMarkup(createElement(PromptOverridePanel, { experienceId: 'x' }));
const wizard = () => renderToStaticMarkup(createElement(CreateWizard));

describe("a chat experience's prompt steps", () => {
  it('link to the prompt template for a role that can open prompt templates', () => {
    uiAccess.hold('ai-experiences:edit', 'prompts:view');
    expect(prompts()).toContain('href="/prompt-templates/t1"');
  });

  it('leave the link out for a role that can’t, still naming the template', () => {
    uiAccess.hold('ai-experiences:edit');
    const html = prompts();
    expect(html).not.toContain('href="/prompt-templates');
    expect(html).toContain('Planner');
  });
});

describe("the chat experience wizard's MCP step", () => {
  it('offers Create one to a role that can create MCP connections', () => {
    uiAccess.hold('ai-experiences:edit', 'tools:edit');
    const html = wizard();
    expect(html).toContain('No MCP connections yet.');
    expect(html).toContain('href="/mcp-connections/create"');
  });

  it('leaves it out for a role that can’t', () => {
    uiAccess.hold('ai-experiences:edit', 'tools:view');
    const html = wizard();
    expect(html).toContain('No MCP connections yet.');
    expect(html).not.toContain('href="/mcp-connections/create"');
  });
});
