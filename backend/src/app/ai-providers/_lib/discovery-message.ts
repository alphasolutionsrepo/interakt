// src/app/ai-providers/_lib/discovery-message.ts

import type { ModelDiscoveryResult } from '@/features/ai-providers';

/**
 * What Discover Models tells the admin: the counts, then every model it couldn't save and
 * every new model that still needs setting up (an embedding model's dimensions), the new
 * models it added switched off and the listed ones an admin switched off, so a run with a
 * failure still says which need attention.
 */
export function discoveryMessage(result: ModelDiscoveryResult): { level: 'success' | 'warning'; text: string } {
  const parts = [`Found ${result.modelsFound} models (${result.modelsAdded} new)`];
  if (result.errors.length > 0) parts.push(`Not saved: ${result.errors.join('; ')}`);
  if (result.needsSetup.length > 0) parts.push(`Needs setup: ${result.needsSetup.join('; ')}`);
  if (result.addedOff.length > 0) parts.push(`${result.addedOff.length} new added switched off: switch on the ones you want in Manage Models`);
  // A cloud provider can have hundreds left off: past a few, the count says enough
  if (result.leftOff.length > 5) parts.push(`${result.leftOff.length} listed models left off as you set them (switch on in Manage Models)`);
  else if (result.leftOff.length > 0) parts.push(`Left off as you set them (switch on in Manage Models): ${result.leftOff.join(', ')}`);
  // Models added or left switched off wait for the admin's choice: worth saying, not a warning
  const needsAttention = result.errors.length > 0 || result.needsSetup.length > 0;
  return { level: needsAttention ? 'warning' : 'success', text: parts.join('. ') };
}
