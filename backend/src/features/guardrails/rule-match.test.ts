import { describe, it, expect } from 'vitest';

import { blocklistTerms, ruleMatches } from './rule-match';

describe('blocklistTerms', () => {
  it('keeps only non-empty strings and tolerates a missing or invalid list', () => {
    expect(blocklistTerms({ terms: ['a', '', null, 5, 'b'] })).toEqual(['a', 'b']);
    expect(blocklistTerms({})).toEqual([]);
    expect(blocklistTerms({ terms: 'a' })).toEqual([]);
  });
});

describe('ruleMatches', () => {
  it('blocklist matches any term, ignoring case', () => {
    expect(ruleMatches({ type: 'blocklist', config: { terms: ['Secret'] } }, 'a SECRET plan')).toBe(true);
    expect(ruleMatches({ type: 'blocklist', config: { terms: ['secret'] } }, 'nothing here')).toBe(false);
    expect(ruleMatches({ type: 'blocklist', config: { terms: [] } }, 'secret')).toBe(false);
  });

  it('blocklist ignores stored terms that are not non-empty strings', () => {
    const rule = { type: 'blocklist', config: { terms: [null, 42, '', 'secret'] } };
    expect(ruleMatches(rule, 'a secret plan')).toBe(true);
    expect(ruleMatches(rule, 'nothing here')).toBe(false);
    expect(ruleMatches({ type: 'blocklist', config: { terms: [null, ''] } }, 'anything')).toBe(false);
  });

  it('max_length matches only text longer than the limit', () => {
    expect(ruleMatches({ type: 'max_length', config: { maxChars: 5 } }, '123456')).toBe(true);
    expect(ruleMatches({ type: 'max_length', config: { maxChars: 5 } }, '12345')).toBe(false);
    expect(ruleMatches({ type: 'max_length', config: {} }, '123456')).toBe(false);
  });

  it('regex_filter matches case-insensitively by default, honours flags, ignores a bad pattern', () => {
    expect(ruleMatches({ type: 'regex_filter', config: { pattern: 'abc' } }, 'xABCx')).toBe(true);
    expect(ruleMatches({ type: 'regex_filter', config: { pattern: 'abc', flags: '' } }, 'xABCx')).toBe(false);
    expect(ruleMatches({ type: 'regex_filter', config: { pattern: '(' } }, 'anything')).toBe(false);
  });

  it('other rule types never match', () => {
    expect(ruleMatches({ type: 'topic_gate', config: {} }, 'anything')).toBe(false);
  });
});
