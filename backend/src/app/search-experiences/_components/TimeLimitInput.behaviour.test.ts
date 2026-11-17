// src/app/search-experiences/_components/TimeLimitInput.behaviour.test.ts

/**
 * The time limit field while the admin types: a half-typed value stays in the field and saves
 * nothing, a value in range is saved at once, and leaving the field brings it within range. The
 * component is called directly with a minimal state hook; the Input's props are what it renders.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ value: undefined as unknown, used: false }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: (initial: unknown) => {
    if (!state.used) { state.value = initial; state.used = true; }
    return [state.value, (next: unknown) => { state.value = next; }];
  },
}));

import { TimeLimitInput } from './TimeLimitInput';

type InputProps = { value: string; onChange: (e: { target: { value: string } }) => void; onBlur: () => void };

let saved: number[] = [];
const field = (timeoutMs?: number) =>
  (TimeLimitInput({ id: 't', timeoutMs, onChange: (ms) => saved.push(ms) }) as { props: InputProps }).props;

beforeEach(() => {
  state.used = false;
  saved = [];
});

describe('TimeLimitInput', () => {
  it('shows the saved limit in seconds, 3 when none is saved', () => {
    expect(field(8000).value).toBe('8');
    state.used = false;
    expect(field().value).toBe('3');
  });

  it('keeps a half-typed value in the field and saves nothing yet', () => {
    field(3000).onChange({ target: { value: '0.' } });
    expect(field(3000).value).toBe('0.');
    expect(saved).toEqual([]);
  });

  it('saves a value in range as soon as it is typed', () => {
    field(3000).onChange({ target: { value: '7.5' } });
    expect(saved).toEqual([7500]);
  });

  it('brings an out-of-range value within range when the field is left, then shows the saved value', () => {
    field(3000).onChange({ target: { value: '0.2' } });
    field(3000).onBlur();
    expect(saved).toEqual([500]);
    field(3000).onChange({ target: { value: '25' } });
    field(3000).onBlur();
    expect(saved).toEqual([500, 10000]);
    expect(field(10000).value).toBe('10');
  });
});
