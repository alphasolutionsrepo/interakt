// src/features/pipeline/fallback-messages.ts

/**
 * Map a provider exception to a user-visible fallback message.
 *
 * Shared between the agentic loop and the deterministic synthesis step so both
 * pipelines surface the same diagnostic when a tool result blows up the LLM
 * call (TPM limit, context length, etc.). For unknown errors we return null so
 * the caller can use its own context-aware default.
 */
export function classifyLlmFailure(error: Error): string | null {
  const msg = error.message ?? '';
  if (/tokens per min|TPM|rate limit/i.test(msg)) {
    return "Sorry — this experience's model hit its per-minute token limit. The tool returned more data than the model can process at the current rate. Try again in a minute, narrow your question, or have your administrator switch this experience to a model with a higher TPM tier.";
  }
  if (/context length|maximum context|context_length_exceeded|too many tokens/i.test(msg)) {
    return "Sorry — a tool returned more data than this experience's model can read in one call. Try a more specific question, or have your administrator switch to a model with a larger context window.";
  }
  return null;
}
