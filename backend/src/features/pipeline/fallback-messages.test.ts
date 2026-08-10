import { describe, expect, it } from 'vitest';

import { classifyLlmFailure } from './fallback-messages';

/**
 * These messages are what a real user sees when the model call fails, so the failure they name
 * has to be the failure that happened. Telling someone their question was not understood, when
 * the truth is that the provider account is out of credit, sends them to rephrase forever while
 * the person who could fix it never hears about it.
 */
describe('classifyLlmFailure', () => {
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

  it('returns null for anything it cannot identify, so the generic fallback applies', () => {
    expect(classifyLlmFailure(new Error('socket hang up'))).toBeNull();
    expect(classifyLlmFailure(new Error(''))).toBeNull();
  });
});
