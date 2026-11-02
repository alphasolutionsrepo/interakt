// src/app/ai-providers/_lib/model-form.test.ts

import { describe, expect, it } from 'vitest';

import type { AIProviderModelResponse } from '@/features/ai-providers';

import { formValuesOf, modelFormSchema, modelUpdateInput, optionalNumber } from './model-form';

const base = {
  modelKey: 'gpt-4o-mini',
  displayName: 'GPT 4o Mini',
  modelType: 'chat' as const,
};

describe('model form', () => {
  it.each(['qwen3.5:9b', 'openai/gpt-5-mini', 'llama3.2:latest'])('accepts the provider key %s', (modelKey) => {
    expect(modelFormSchema.safeParse({ ...base, modelKey }).success).toBe(true);
  });

  it('still requires a model key', () => {
    expect(modelFormSchema.safeParse({ ...base, modelKey: '' }).success).toBe(false);
  });

  it('saves a model whose price boxes are blank', () => {
    const result = modelFormSchema.safeParse({
      ...base,
      inputCostPerMillionTokens: optionalNumber(''),
      outputCostPerMillionTokens: optionalNumber(''),
    });
    expect(result.success).toBe(true);
  });

  it('reads blank as null and a typed value as a number', () => {
    expect(optionalNumber('')).toBeNull();
    expect(optionalNumber(undefined)).toBeNull();
    expect(optionalNumber('0.15')).toBe(0.15);
    expect(optionalNumber('0')).toBe(0);
  });

  it('still asks an embedding model for its dimensions when the box is blank', () => {
    const result = modelFormSchema.safeParse({ ...base, modelType: 'embedding', dimensions: optionalNumber('') });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['dimensions']);
  });

  it('rejects a price that is not a number', () => {
    expect(modelFormSchema.safeParse({ ...base, inputCostPerMillionTokens: optionalNumber('abc') }).success).toBe(false);
  });
});

describe('model form values for a saved model', () => {
  const saved = (prices: { input: number | null; output: number | null }) => ({
    id: 20, modelKey: 'qwen3.5:9b', displayName: 'Qwen 3.5 9B', description: null, modelType: 'chat',
    dimensions: null, isAvailable: true, capabilities: { reasoningEffort: 'none' },
    inputCostPerMillionTokens: prices.input, outputCostPerMillionTokens: prices.output,
  }) as unknown as AIProviderModelResponse;

  it('keeps a price of 0, so saving another change does not clear it', () => {
    const values = formValuesOf(saved({ input: 0, output: 0.6 }));
    expect(values.inputCostPerMillionTokens).toBe(0);
    expect(values.outputCostPerMillionTokens).toBe(0.6);
  });

  it('shows no price as blank, and the saved reasoning level', () => {
    const values = formValuesOf(saved({ input: null, output: null }));
    expect(values.inputCostPerMillionTokens).toBeUndefined();
    expect(values.reasoningEffort).toBe('none');
  });
});

describe('saving an edited model', () => {
  const saved = {
    id: 'm1', modelKey: 'qwen2.5:7b', displayName: 'Qwen 2.5 7B', modelType: 'chat', isAvailable: true,
    capabilities: { contextWindow: 32768, supportsStreaming: true, supportsFunctionCalling: true },
  } as unknown as AIProviderModelResponse;
  const submitted = { modelKey: 'qwen2.5:7b', displayName: 'Qwen 2.5 7B', modelType: 'chat' as const, isAvailable: true };

  it('keeps the capabilities the form does not show', () => {
    const input = modelUpdateInput(saved, { ...submitted, reasoningEffort: 'none' });
    expect(input.capabilities).toEqual({
      contextWindow: 32768, supportsStreaming: true, supportsFunctionCalling: true, reasoningEffort: 'none',
    });
  });

  it('clears Reasoning when set back to Model default', () => {
    const withLevel = { ...saved, capabilities: { ...saved.capabilities, reasoningEffort: 'none' } } as AIProviderModelResponse;
    expect(modelUpdateInput(withLevel, { ...submitted, reasoningEffort: 'default' }).capabilities)
      .toEqual({ contextWindow: 32768, supportsStreaming: true, supportsFunctionCalling: true });
  });
});

