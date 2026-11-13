// app/settings/features/_lib/feature-rows.test.ts

import { describe, expect, it } from 'vitest';

import { dependentsToAsk, needsLabel, rowState, updateBody, type FeatureRow } from './feature-rows';

import { PINNED_OFF_MESSAGE } from '@/features/feature-switches/areas';

const row = (over: Partial<FeatureRow> & { id: FeatureRow['id'] }): FeatureRow => ({
  label: over.id,
  description: '',
  on: true,
  switchedOn: true,
  pinnedOff: false,
  needsAnyOf: [],
  ...over,
});

const search = row({ id: 'search', label: 'Search' });
const chat = row({ id: 'chat', label: 'Chat' });
const ai = row({ id: 'ai-summaries', label: 'AI summaries', needsAnyOf: ['search'] });
const playground = row({ id: 'playground', label: 'Playground', needsAnyOf: ['search', 'chat'] });

describe('needsLabel', () => {
  it('names what the area needs', () => {
    expect(needsLabel(ai, [search, ai])).toBe('Needs Search');
    expect(needsLabel(playground, [search, chat, playground])).toBe('Needs Search or Chat');
  });
});

describe('rowState', () => {
  it('shows what the Admin chose, not whether it is on now', () => {
    expect(rowState(row({ id: 'chat', on: false, switchedOn: true }), [chat])).toMatchObject({ checked: true });
    expect(rowState(row({ id: 'chat', on: false, switchedOn: false }), [chat])).toMatchObject({ checked: false });
  });

  it('locks a pinned-off area off, with the deployment reason', () => {
    const pinned = row({ id: 'chat', on: false, switchedOn: true, pinnedOff: true });
    expect(rowState(pinned, [pinned])).toEqual({ checked: false, reason: PINNED_OFF_MESSAGE });
  });

  it('locks an area whose needs are off, keeping the choice', () => {
    const off = row({ id: 'search', label: 'Search', on: false, switchedOn: false });
    const dependent = row({ id: 'ai-summaries', on: false, switchedOn: true, needsAnyOf: ['search'] });
    expect(rowState(dependent, [off, dependent])).toEqual({ checked: true, reason: 'Needs Search' });
  });

  it('stays free when one of its needs is on, or nothing needs to be on', () => {
    const pg = row({ id: 'playground', needsAnyOf: ['search', 'chat'] });
    const searchOff = row({ id: 'search', on: false, switchedOn: false });
    expect(rowState(pg, [searchOff, chat, pg]).reason).toBeNull();
    expect(rowState(search, [search]).reason).toBeNull();
  });
});

describe('Search off', () => {
  it('asks about AI summaries only when they are switched on', () => {
    expect(dependentsToAsk('search', false, [search, ai])).toEqual(['ai-summaries']);
    expect(dependentsToAsk('search', false, [search, { ...ai, switchedOn: false }])).toEqual([]);
    expect(dependentsToAsk('search', true, [search, ai])).toEqual([]);
    expect(dependentsToAsk('chat', false, [chat, playground])).toEqual([]);
  });

  it('sends one body, with or without AI summaries', () => {
    expect(updateBody('search', false, ['ai-summaries'])).toEqual({ areas: { search: false, 'ai-summaries': false } });
    expect(updateBody('search', false, [])).toEqual({ areas: { search: false } });
  });
});
