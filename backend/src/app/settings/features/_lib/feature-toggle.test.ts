// app/settings/features/_lib/feature-toggle.test.ts

import { describe, expect, it, vi } from 'vitest';

import type { FeatureRow } from './feature-rows';
import { bodyForChoice, decideToggle, featureKeys, invalidateAfterSave, saveErrorText } from './feature-toggle';

import type { Area } from '@/features/feature-switches/areas';

vi.mock('@/shared/access/useAccess', async () => (await import('@/shared/test/ui-access-stub')).useAccessModule);

const row = (id: Area, over: Partial<FeatureRow> = {}): FeatureRow => ({
  id, label: id, description: '', on: true, switchedOn: true, pinnedOff: false, needsAnyOf: [], ...over,
});
const rows = [row('search'), row('ai-summaries' as Area, { needsAnyOf: ['search'] }), row('chat')];

describe('decideToggle', () => {
  it('asks when switching Search off while AI summaries are on', () => {
    expect(decideToggle(rows, 'search', false)).toEqual({ ask: { id: 'search', dependents: ['ai-summaries'] } });
  });
  it('does not ask when AI summaries are already off', () => {
    const r = [row('search'), row('ai-summaries' as Area, { switchedOn: false, needsAnyOf: ['search'] })];
    expect(decideToggle(r, 'search', false)).toEqual({ save: { areas: { search: false } } });
  });
  it('saves another area straight away', () => {
    expect(decideToggle(rows, 'chat', false)).toEqual({ save: { areas: { chat: false } } });
  });
  it('saves switching on straight away', () => {
    expect(decideToggle(rows, 'search', true)).toEqual({ save: { areas: { search: true } } });
  });
});

describe('decideToggle with needs off', () => {
  const noSearch = [row('search', { on: false, switchedOn: false }), row('ai-summaries' as Area, { on: false, needsAnyOf: ['search'] })];
  it('saves switching a dependent area off while its need is off', () => {
    expect(decideToggle(noSearch, 'ai-summaries' as Area, false)).toEqual({ save: { areas: { 'ai-summaries': false } } });
  });
  it('saves switching a dependent area on while its need is off', () => {
    const r = [noSearch[0], row('ai-summaries' as Area, { on: false, switchedOn: false, needsAnyOf: ['search'] })];
    expect(decideToggle(r, 'ai-summaries' as Area, true)).toEqual({ save: { areas: { 'ai-summaries': true } } });
  });
});

describe('bodyForChoice', () => {
  const asking = { id: 'search' as Area, dependents: ['ai-summaries' as Area] };
  it('saves nothing on Cancel', () => expect(bodyForChoice(asking, 'cancel')).toBeNull());
  it('saves nothing when nothing is being asked', () => expect(bodyForChoice(null, 'both')).toBeNull());
  it('"Search only" switches just the area off', () =>
    expect(bodyForChoice(asking, 'only')).toEqual({ areas: { search: false } }));
  it('"Switch both off" includes the dependents', () =>
    expect(bodyForChoice(asking, 'both')).toEqual({ areas: { search: false, 'ai-summaries': false } }));
});

describe('after a save', () => {
  it('refreshes the features list and the menu (accessKeys.mine)', () => {
    const invalidateQueries = vi.fn();
    invalidateAfterSave({ invalidateQueries });
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: featureKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['access', 'mine'] });
  });
  it('shows the server message on failure, a fallback otherwise', () => {
    expect(saveErrorText(new Error('Only an Admin can do that'))).toBe('Only an Admin can do that');
    expect(saveErrorText('boom')).toBe('Could not save the change');
  });
});
