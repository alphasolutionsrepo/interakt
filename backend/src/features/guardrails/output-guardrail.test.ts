import { describe, it, expect } from 'vitest';

import { applyOutputGuardrail } from './output-guardrail';

import type { GuardrailConfig, GuardrailRule } from '@/db/schema';


let n = 0;
function rule(overrides: Partial<GuardrailRule>): GuardrailRule {
  n += 1;
  return {
    id: `r${n}`,
    name: `rule ${n}`,
    type: 'blocklist',
    config: {},
    action: 'block',
    enabled: true,
    priority: n,
    ...overrides,
  };
}

function config(
  rules: GuardrailRule[],
  opts: { enabled?: boolean; enforced?: boolean; message?: string } = {},
): GuardrailConfig {
  return {
    inputGuardrail: { enabled: false, rules: [], onBlock: { message: '' } },
    outputGuardrail: {
      enabled: opts.enabled ?? true,
      rules,
      onBlock: { message: opts.message as string },
    },
    enforced: opts.enforced,
  };
}

describe('applyOutputGuardrail', () => {
  it('does not run when the stage is off and the experience is not locked', () => {
    const cfg = config([rule({ config: { terms: ['secret'] } })], { enabled: false });
    expect(applyOutputGuardrail(cfg, 'a secret')).toEqual({
      text: 'a secret', outcome: 'not_run', firedRules: [], forcedByPolicy: false,
    });
  });

  it('does not run without a config or for empty text', () => {
    expect(applyOutputGuardrail(null, 'hello').outcome).toBe('not_run');
    expect(applyOutputGuardrail(undefined, 'hello').text).toBe('hello');
    const cfg = config([rule({ type: 'max_length', config: { maxChars: 1 } })]);
    expect(applyOutputGuardrail(cfg, '').outcome).toBe('not_run');
  });

  it('runs a locked experience with rules even when the stage is off', () => {
    const cfg = config([rule({ config: { terms: ['secret'] }, name: 'no secrets' })], {
      enabled: false, enforced: true, message: 'nope',
    });
    expect(applyOutputGuardrail(cfg, 'a secret')).toEqual({
      text: 'nope', outcome: 'blocked', firedRules: ['no secrets'], forcedByPolicy: true,
    });
  });

  it('does not run a locked experience that has no rules', () => {
    expect(applyOutputGuardrail(config([], { enabled: false, enforced: true }), 'x').outcome).toBe('not_run');
  });

  it('blocks on a blocklist term, ignoring case', () => {
    const cfg = config([rule({ config: { terms: ['Forbidden'] } })], { message: 'BLOCKED' });
    const result = applyOutputGuardrail(cfg, 'this is FORBIDDEN stuff');
    expect(result.outcome).toBe('blocked');
    expect(result.text).toBe('BLOCKED');
    expect(applyOutputGuardrail(cfg, 'all good').outcome).toBe('passed');
  });

  it('uses the default block message when none is set', () => {
    const cfg = config([rule({ config: { terms: ['bad'] } })]);
    expect(applyOutputGuardrail(cfg, 'bad').text).toBe('The response was blocked by content policy.');
  });

  it('blocks text over max_length and passes text within it', () => {
    const cfg = config([rule({ type: 'max_length', config: { maxChars: 10 } })], { message: 'too long' });
    expect(applyOutputGuardrail(cfg, 'x'.repeat(11)).text).toBe('too long');
    expect(applyOutputGuardrail(cfg, 'x'.repeat(10))).toMatchObject({ outcome: 'passed', text: 'x'.repeat(10) });
  });

  it('truncates with an ellipsis when max_length redacts', () => {
    const cfg = config([rule({ type: 'max_length', action: 'redact', config: { maxChars: 5 }, name: 'short' })]);
    expect(applyOutputGuardrail(cfg, 'abcdefghij')).toMatchObject({
      outcome: 'redacted', text: 'abcde...', firedRules: ['short'],
    });
  });

  it('redacts a regex match with its replacement, or [REDACTED] by default', () => {
    const custom = config([rule({ type: 'regex_filter', action: 'redact', config: { pattern: '\\d{4}', replacement: '####' } })]);
    expect(applyOutputGuardrail(custom, 'pin 1234 and 5678').text).toBe('pin #### and ####');
    const plain = config([rule({ type: 'regex_filter', action: 'redact', config: { pattern: '\\d{4}' } })]);
    expect(applyOutputGuardrail(plain, 'pin 1234').text).toBe('pin [REDACTED]');
  });

  it('ignores an invalid regex', () => {
    const block = config([rule({ type: 'regex_filter', config: { pattern: '(' } })]);
    expect(applyOutputGuardrail(block, 'text').outcome).toBe('passed');
    const redact = config([rule({ type: 'regex_filter', action: 'redact', config: { pattern: '(' } })]);
    expect(applyOutputGuardrail(redact, 'text')).toMatchObject({ outcome: 'passed', text: 'text', firedRules: [] });
  });

  it('skips disabled rules', () => {
    const cfg = config([rule({ enabled: false, config: { terms: ['bad'] } })]);
    expect(applyOutputGuardrail(cfg, 'bad').outcome).toBe('passed');
  });

  it('applies rules in priority order, so a later block sees redacted text', () => {
    const rules = [
      rule({ priority: 2, config: { terms: ['secret'] }, name: 'block' }),
      rule({ priority: 1, type: 'regex_filter', action: 'redact', config: { pattern: 'secret', replacement: 'xxx' }, name: 'redact' }),
    ];
    const result = applyOutputGuardrail(config(rules), 'a secret');
    expect(result).toMatchObject({ outcome: 'redacted', text: 'a xxx', firedRules: ['redact'] });
  });

  it('reports a block by a rule after an earlier redact in firedRules', () => {
    const rules = [
      rule({ priority: 1, type: 'regex_filter', action: 'redact', config: { pattern: 'a', replacement: 'b' }, name: 'redact' }),
      rule({ priority: 2, config: { terms: ['bbb'] }, name: 'block' }),
    ];
    const result = applyOutputGuardrail(config(rules, { message: 'M' }), 'aaa');
    expect(result).toMatchObject({ outcome: 'blocked', text: 'M', firedRules: ['redact', 'block'] });
  });

  it('names a fired rule by its id when it has no name', () => {
    const cfg = config([rule({ id: 'rule-x', name: '', config: { terms: ['bad'] } })]);
    expect(applyOutputGuardrail(cfg, 'bad').firedRules).toEqual(['rule-x']);
  });
});
