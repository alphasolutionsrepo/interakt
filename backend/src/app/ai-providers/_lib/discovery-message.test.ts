// src/app/ai-providers/_lib/discovery-message.test.ts

import { describe, expect, it } from 'vitest';

import { discoveryMessage } from './discovery-message';

import type { ModelDiscoveryResult } from '@/features/ai-providers';

const result = (over: Partial<ModelDiscoveryResult>): ModelDiscoveryResult => ({
  success: true, modelsFound: 3, modelsAdded: 2, modelsUpdated: 1, modelsRemoved: 0, errors: [], needsSetup: [], leftOff: [], addedOff: [], ...over,
});

describe('the Discover Models message', () => {
  it('is a success with the counts when every model was saved', () => {
    expect(discoveryMessage(result({}))).toEqual({ level: 'success', text: 'Found 3 models (2 new)' });
  });

  it('names the embedding models that need their dimensions', () => {
    expect(discoveryMessage(result({ needsSetup: ['emb: set its dimensions on the model'] }))).toEqual({
      level: 'warning', text: 'Found 3 models (2 new). Needs setup: emb: set its dimensions on the model',
    });
  });

  it('names the listed models that are switched off, and where to switch them on', () => {
    expect(discoveryMessage(result({ leftOff: ['big-expensive-model'] }))).toEqual({
      level: 'success', text: 'Found 3 models (2 new). Listed but switched off (switch on in Manage Models): big-expensive-model',
    });
  });

  it('counts the models left off once there are more than a few', () => {
    const leftOff = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(discoveryMessage(result({ leftOff })).text).toBe('Found 3 models (2 new). 6 listed models are switched off (switch on in Manage Models)');
  });

  it('says how many new models were added switched off, and where to choose', () => {
    expect(discoveryMessage(result({ addedOff: ['a', 'b'] }))).toEqual({
      level: 'success', text: 'Found 3 models (2 new). 2 new added switched off: switch on the ones you want in Manage Models',
    });
  });

  it('names the models that failed, and still the ones that need setup', () => {
    const { level, text } = discoveryMessage(result({
      success: false,
      errors: ['Failed to process model big-model: value too long'],
      needsSetup: ['emb: set its dimensions on the model'],
    }));
    expect(level).toBe('warning');
    expect(text).toBe('Found 3 models (2 new). Not saved: Failed to process model big-model: value too long. Needs setup: emb: set its dimensions on the model');
  });
});
