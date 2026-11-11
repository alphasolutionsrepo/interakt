// src/app/ai-providers/_components/model-form.shorten.test.ts

/**
 * The model form's "Can shorten vectors" switch: shown for embedding models with the saved
 * value, switchable only with the right to change models, and saved with the model.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { modelUpdateInput } from '../_lib/model-form';

import { ModelFormDialog } from './ModelFormDialog';

import type { AIProviderModelResponse } from '@/features/ai-providers';
import { uiAccess } from '@/shared/test/ui-access-stub';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);
vi.mock('@/components/ui/dialog', async () => (await import('@/shared/test/open-overlays-stub')).dialog);

const saved = (extra: Partial<AIProviderModelResponse> = {}) => ({
  id: 3, providerId: 'p1', modelKey: 'qwen3-embedding:4b', displayName: 'Qwen3 Embedding', description: null,
  modelType: 'embedding', dimensions: 1536, canShortenVectors: true, capabilities: {}, isAvailable: true,
  isDiscovered: false, sortOrder: 0, ...extra,
}) as unknown as AIProviderModelResponse;

const form = (model: AIProviderModelResponse) => renderToStaticMarkup(createElement(ModelFormDialog, {
  open: true, onOpenChange: () => {}, providerId: 'p1', providerName: 'Local Ollama', model, onSubmit: async () => {},
}));
const shortenSwitch = (html: string) => /<button[^>]*role="switch"[^>]*aria-label="Can shorten vectors"[^>]*>/.exec(html)?.[0];

describe('the Can shorten vectors switch', () => {
  beforeEach(() => uiAccess.hold('ai-providers:manage', 'ai-providers:view'));

  it('shows the saved value of an embedding model, with a line saying what it does', () => {
    const html = form(saved());
    expect(shortenSwitch(html)).toContain('aria-checked="true"');
    expect(html).toContain('returns shorter vectors when asked');
    expect(shortenSwitch(form(saved({ canShortenVectors: false })))).toContain('aria-checked="false"');
  });

  it('can be switched by someone who can change models', () => {
    expect(shortenSwitch(form(saved()))).not.toContain('disabled=""');
  });

  it('is locked, still showing its value, for someone who can only view providers', () => {
    uiAccess.hold('ai-providers:view');
    const tag = shortenSwitch(form(saved()));
    expect(tag).toContain('disabled=""');
    expect(tag).toContain('aria-checked="true"');
  });

  it('is not shown for a chat model', () => {
    expect(shortenSwitch(form(saved({ modelType: 'chat', dimensions: null, canShortenVectors: false })))).toBeUndefined();
  });
});

describe('saving the switch', () => {
  const submission = (canShortenVectors: boolean) => ({
    modelKey: 'qwen3-embedding:4b', displayName: 'Qwen3 Embedding', modelType: 'embedding' as const,
    dimensions: 1536, canShortenVectors, isAvailable: true,
  });

  it('sends the switch with the update of an embedding model', () => {
    expect(modelUpdateInput(saved(), submission(false))).toMatchObject({ canShortenVectors: false });
    expect(modelUpdateInput(saved({ canShortenVectors: false }), submission(true))).toMatchObject({ canShortenVectors: true });
  });

  it('leaves it out of the update of any other model', () => {
    expect(modelUpdateInput(saved({ modelType: 'chat' }), submission(true)).canShortenVectors).toBeUndefined();
  });
});
