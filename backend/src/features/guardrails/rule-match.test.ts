import { describe, it, expect } from 'vitest';

import { ruleMatches } from './rule-match';

describe('ruleMatches', () => {
  it('blocklist matches any term, ignoring case', () => {
    expect(ruleMatches({ type: 'blocklist', config: { terms: ['Secret'] } }, 'a SECRET plan')).toBe(true);
    expect(ruleMatches({ type: 'blocklist', config: { terms: ['secret'] } }, 'nothing here')).toBe(false);
    expect(ruleMatches({ type: 'blocklist', config: { terms: [] } }, 'secret')).toBe(false);
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
