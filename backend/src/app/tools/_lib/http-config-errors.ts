// src/app/tools/_lib/http-config-errors.ts

import { urlProblemMessage } from '@/features/tools/executors/http-url';

/** Why a typed base URL won't run, shown as the admin types; undefined when it is empty or fine. */
export function baseUrlProblem(baseUrl: unknown): string | undefined {
  return typeof baseUrl === 'string' && baseUrl.trim() ? urlProblemMessage(baseUrl.trim()) : undefined;
}

/** The create wizard's errors for an HTTP tool's settings, by field; empty when the step can pass. */
export function httpConfigErrors(config: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  const urlProblem = baseUrlProblem(config.baseUrl);
  if (typeof config.baseUrl !== 'string' || !config.baseUrl.trim()) errors.baseUrl = 'Base URL is required';
  else if (urlProblem) errors.baseUrl = urlProblem;
  if (!(config.responseMapping as Record<string, unknown> | undefined)?.resultsPath) {
    errors['responseMapping.resultsPath'] = 'Results path is required';
  }
  return errors;
}
