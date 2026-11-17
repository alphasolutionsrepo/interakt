// src/app/ai-providers/_lib/discovery-message.ts

import type { ModelDiscoveryResult } from '@/features/ai-providers';

/**
 * What Discover Models tells the admin: the counts, then every model it couldn't save and
 * every new model that still needs setting up (an embedding model's dimensions), and the
 * listed models it left switched off, so a run with a failure still says which need attention.
 */
export function discoveryMessage(result: ModelDiscoveryResult): { level: 'success' | 'warning'; text: string } {
  const parts = [`Found ${result.modelsFound} models (${result.modelsAdded} new)`];
  if (result.errors.length > 0) parts.push(`Not saved: ${result.errors.join('; ')}`);
  if (result.needsSetup.length > 0) parts.push(`Needs setup: ${result.needsSetup.join('; ')}`);
  if (result.leftOff.length > 0) parts.push(`Left off as you set them (switch on in Manage Models): ${result.leftOff.join(', ')}`);
  // Models left off are the admin's own choice: worth saying, not a warning
  const needsAttention = result.errors.length > 0 || result.needsSetup.length > 0;
  return { level: needsAttention ? 'warning' : 'success', text: parts.join('. ') };
}
