// src/app/ai-providers/_lib/discovery-message.ts

import type { ModelDiscoveryResult } from '@/features/ai-providers';

/**
 * What Discover Models tells the admin: the counts, then every model it couldn't save and
 * every new model that still needs setting up (an embedding model's dimensions), so a run
 * with a failure still says which models need attention.
 */
export function discoveryMessage(result: ModelDiscoveryResult): { level: 'success' | 'warning'; text: string } {
  const parts = [`Found ${result.modelsFound} models (${result.modelsAdded} new)`];
  if (result.errors.length > 0) parts.push(`Not saved: ${result.errors.join('; ')}`);
  if (result.needsSetup.length > 0) parts.push(`Needs setup: ${result.needsSetup.join('; ')}`);
  return { level: parts.length > 1 ? 'warning' : 'success', text: parts.join('. ') };
}
