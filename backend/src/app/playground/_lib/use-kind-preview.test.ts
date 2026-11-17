// src/app/playground/_lib/use-kind-preview.test.ts

/**
 * The widget playground's applied preview is dropped, not just hidden, once its kind's area is seen
 * off, so switching the area back on doesn't bring the old preview back without Apply. The hook is
 * called directly with useState stubbed to hold a preview and record what it is set to.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useKindPreview } from './area-gate';

import type { Area } from '@/features/feature-switches/areas';

const state = vi.hoisted(() => ({ held: null as unknown, setTo: [] as unknown[] }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: () => [state.held, (v: unknown) => state.setTo.push(v)],
}));

const chatPreview = { kind: 'chat' as const, experienceId: 'c1' };
const allOn = () => true;
const chatOff = (a: Area) => a !== 'chat';

describe('the applied widget preview', () => {
  beforeEach(() => {
    state.held = chatPreview;
    state.setTo = [];
  });

  it('is dropped once its kind is switched off', () => {
    const [shown] = useKindPreview(chatOff, false);
    expect(shown).toBeNull();
    expect(state.setTo).toEqual([null]);
  });

  it('is kept and shown while its kind is on (control)', () => {
    const [shown] = useKindPreview(allOn, false);
    expect(shown).toBe(chatPreview);
    expect(state.setTo).toEqual([]);
  });

  it('is kept while access loads, when every area reads off', () => {
    const [shown] = useKindPreview(() => false, true);
    expect(shown).toBeNull();
    expect(state.setTo).toEqual([]);
  });

  it('is kept when another kind is switched off', () => {
    const [shown] = useKindPreview((a) => a !== 'search', false);
    expect(shown).toBe(chatPreview);
    expect(state.setTo).toEqual([]);
  });
});
