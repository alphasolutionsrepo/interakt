// src/features/pipeline/fallback-messages.ts

/**
 * Map a provider exception to a user-visible fallback message.
 *
 * Shared between the agentic loop and the deterministic synthesis step so both
 * pipelines surface the same diagnostic when a tool result blows up the LLM
 * call (TPM limit, context length, etc.). For unknown errors we return null so
 * the caller can use its own context-aware default.
 */
export function classifyLlmFailure(error: Error, options: { stage?: 'planning' } = {}): string | null {
  // At planning no tool has run yet, so the limit messages can't blame a tool's result
  const planning = options.stage === 'planning';
  const msg = error.message ?? '';
  // Our setup, not the provider: its API key secret is gone or can't be decrypted
  if ((error as Error & { code?: unknown }).code === 'PROVIDER_KEY_UNAVAILABLE') {
    return "Sorry — this experience cannot reach its AI provider: the provider's API key can't be read. An administrator needs to check it on the AI Providers page.";
  }
  if (/tokens per min|TPM|rate limit/i.test(msg)) {
    if (planning) {
      return "Sorry — this experience's model hit its per-minute token limit. Try again in a minute, or have your administrator switch this experience to a model with a higher limit.";
    }
    return "Sorry — this experience's model hit its per-minute token limit. The tool returned more data than the model can process at the current rate. Try again in a minute, narrow your question, or have your administrator switch this experience to a model with a higher TPM tier.";
  }
  if (/context length|maximum context|context_length_exceeded|too many tokens/i.test(msg)) {
    if (planning) {
      return "Sorry — your conversation is more than this experience's model can read in one call. Try a shorter or more specific question, or have your administrator switch to a model with a larger context window.";
    }
    return "Sorry — a tool returned more data than this experience's model can read in one call. Try a more specific question, or have your administrator switch to a model with a larger context window.";
  }
  // Billing, not comprehension. Without this the generic fallback tells the user their question
  // was not understood and invites them to rephrase — which they can do all day without effect,
  // while the one person who can fix it never finds out. Checked after the rate-limit branch
  // because both surface as HTTP 429 and only the message distinguishes them.
  if (/insufficient_quota|no credits remaining|exceeded your current quota|billing/i.test(msg)) {
    return 'Sorry — this experience cannot reach its AI provider because the account has no remaining credit. Rephrasing will not help; an administrator needs to check billing for the configured provider.';
  }
  if (/invalid_api_key|incorrect api key|unauthorized|401/i.test(msg)) {
    return 'Sorry — this experience cannot reach its AI provider: the configured API key was rejected. An administrator needs to check the credentials for this provider.';
  }
  return null;
}
