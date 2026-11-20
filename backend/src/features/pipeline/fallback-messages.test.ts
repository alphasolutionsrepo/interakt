import { describe, expect, it } from 'vitest';

import { classifyLlmFailure } from './fallback-messages';

/**
 * These messages are what a real user sees when the model call fails, so the failure they name
 * has to be the failure that happened. Telling someone their question was not understood, when
 * the truth is that the provider account is out of credit, sends them to rephrase forever while
 * the person who could fix it never hears about it.
 */
describe('classifyLlmFailure', () => {
  it('names a provider key that can\'t be read as one an administrator must check, naming nothing else', () => {
    const err = Object.assign(
      new Error('The API key for "Campus gateway" (Secrets Vault secret "campus_key") can\'t be decrypted with this server\'s encryption key. Restore the previous SECRETS_ENCRYPTION_KEY, or enter the key again on the AI Providers page.'),
      { code: 'PROVIDER_KEY_UNAVAILABLE' },
    );
    const msg = classifyLlmFailure(err);
    expect(msg).toMatch(/API key can't be read.*AI Providers page/);
    expect(msg).not.toMatch(/SECRETS_ENCRYPTION_KEY|Campus gateway|campus_key|decrypt/);
  });

  it('names a rate limit as a rate limit', () => {
    const msg = classifyLlmFailure(
      new Error('Rate limit reached for gpt-4o on tokens per min (TPM): Limit 30000'),
    );
    expect(msg).toMatch(/token limit/i);
  });

  it('names a spent account as a billing problem, not a comprehension one', () => {
    // Real OpenAI text. It arrives as a 429 like a rate limit does, so only the body separates
    // "wait a minute" from "add credit".
    const msg = classifyLlmFailure(
      new Error('You have no credits remaining. Add credits to continue using the API.'),
    );
    expect(msg).toMatch(/credit/i);
    expect(msg).toMatch(/administrator/i);
    // Must not *invite* the user to try again differently — that is the trap. Saying
    // "rephrasing will not help" is the opposite, and allowed.
    expect(msg).not.toMatch(/try again|narrow your question|could you|be more specific/i);
  });

  it('recognises the other quota phrasing', () => {
    expect(classifyLlmFailure(new Error('insufficient_quota'))).toMatch(/credit/i);
    expect(classifyLlmFailure(new Error('You exceeded your current quota'))).toMatch(/credit/i);
  });

  it('names a rejected key as a credentials problem', () => {
    const msg = classifyLlmFailure(new Error('Incorrect API key provided'));
    expect(msg).toMatch(/key was rejected|credentials/i);
  });

  it('prefers the rate-limit reading when a message could be either', () => {
    // Both are 429s. A message that mentions TPM is a wait-and-retry, even if it also says quota.
    const msg = classifyLlmFailure(new Error('Rate limit reached: tokens per min (TPM) quota'));
    expect(msg).toMatch(/token limit/i);
  });

  it('keeps the context-window case distinct', () => {
    expect(classifyLlmFailure(new Error('context_length_exceeded'))).toMatch(/context window/i);
  });

  it('at planning, names the limits without blaming a tool, since none has run', () => {
    const rate = classifyLlmFailure(new Error('Rate limit reached for requests'), { stage: 'planning' });
    expect(rate).toMatch(/per-minute token limit/i);
    expect(rate).not.toMatch(/tool/i);
    const context = classifyLlmFailure(new Error('context_length_exceeded'), { stage: 'planning' });
    expect(context).toMatch(/context window/i);
    expect(context).not.toMatch(/tool/i);
    // Other failures read the same at either stage
    expect(classifyLlmFailure(new Error('insufficient_quota'), { stage: 'planning' })).toBe(classifyLlmFailure(new Error('insufficient_quota')));
    expect(classifyLlmFailure(new Error('socket hang up'), { stage: 'planning' })).toBeNull();
  });

  it('returns null for anything it cannot identify, so the generic fallback applies', () => {
    expect(classifyLlmFailure(new Error('socket hang up'))).toBeNull();
    expect(classifyLlmFailure(new Error(''))).toBeNull();
  });
});
